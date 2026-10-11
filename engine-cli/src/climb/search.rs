//! Iterated local search over legal rosters, scored by mean wins on a fixed seed panel.
use super::data::Dataset;
use super::evaluate::{Evaluator, SeasonScore};
use super::roster::{linear_start, neighbor, Roster, RosterIds};
use engine::random::{random_stream, Mulberry32};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchConfig {
    pub seed: u32,
    /// Seasons per roster on the full panel; the first `screen` of them screen proposals.
    pub panel: usize,
    pub screen: usize,
    /// Proposals screened together, and how many of them reach the full panel.
    pub batch: usize,
    pub promote: usize,
    /// Candidates per slot that replacement moves draw from.
    pub pool: usize,
    /// Proposals without an acceptance before a perturbation restart from the best roster.
    pub stall: usize,
    pub kick: usize,
}

/// A roster with its full-panel scores.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scored { pub roster: RosterIds, pub scores: Vec<SeasonScore> }

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub data_version: String,
    pub config: SearchConfig,
    pub iteration: u64,
    pub proposals: u64,
    pub since_acceptance: u64,
    pub elapsed_seconds: f64,
    pub current: Scored,
    pub best: Scored,
    pub history: Vec<Step>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Step { pub iteration: u64, pub kind: String, pub mean_wins: f64, pub lower_bound: f64 }

/// `count` distinct seeds drawn from the named stream of `seed`, skipping any in `exclude`.
pub fn seeds(seed: u32, stream: &str, count: usize, exclude: &[u32]) -> Vec<u32> {
    let mut random = random_stream(seed, stream);
    let mut out = Vec::with_capacity(count);
    while out.len() < count {
        let value = (random.next() * 4294967296.0) as u32;
        if !out.contains(&value) && !exclude.contains(&value) { out.push(value); }
    }
    out
}

pub fn mean_wins(scores: &[SeasonScore]) -> f64 { scores.iter().map(|score| f64::from(score.wins)).sum::<f64>() / scores.len() as f64 }

/// Mean paired win difference and its 95% lower confidence bound.
pub fn paired(candidate: &[SeasonScore], baseline: &[SeasonScore]) -> (f64, f64) {
    let n = candidate.len() as f64;
    let differences: Vec<f64> = candidate.iter().zip(baseline).map(|(a, b)| f64::from(a.wins) - f64::from(b.wins)).collect();
    let mean = differences.iter().sum::<f64>() / n;
    if candidate.len() < 2 { return (mean, mean); }
    let variance = differences.iter().map(|value| (value - mean) * (value - mean)).sum::<f64>() / (n - 1.0);
    (mean, mean - 1.96 * (variance / n).sqrt())
}

pub struct Search<'d> {
    pub data: &'d Dataset,
    pub evaluator: Evaluator<'d>,
    pub panel: Vec<u32>,
    pub state: Checkpoint,
    current: Roster,
    best: Roster,
}

impl<'d> Search<'d> {
    /// Starts from the best linear roster in the stadium that screens best, or resumes a checkpoint.
    pub fn start(data: &'d Dataset, config: SearchConfig, resume: Option<Checkpoint>) -> Result<Self, String> {
        let evaluator = Evaluator::new(data)?;
        let panel = seeds(config.seed, "hill-climb:panel", config.panel, &[]);
        if let Some(state) = resume {
            if state.data_version != data.data_version { return Err("Checkpoint was made with a different dataset".into()); }
            if state.config != config { return Err("Checkpoint was made with different search options".into()); }
            let current = Roster::from_ids(&state.current.roster, data)?;
            let best = Roster::from_ids(&state.best.roster, data)?;
            return Ok(Self { data, evaluator, panel, state, current, best });
        }
        let linear = linear_start(data, 0)?;
        let screen = &panel[..config.screen];
        let stadiums: Vec<Roster> = (0..data.engine.data.stadiums.len()).map(|stadium| Roster { stadium, ..linear.clone() }).collect();
        let screened = stadiums.par_iter().map(|roster| evaluator.scores(roster, screen)).collect::<Result<Vec<_>, _>>()?;
        let pick = (0..stadiums.len()).max_by(|a, b| mean_wins(&screened[*a]).total_cmp(&mean_wins(&screened[*b])).then(b.cmp(a))).unwrap();
        let current = stadiums[pick].clone();
        let scores = evaluator.scores(&current, &panel)?;
        let scored = Scored { roster: current.ids(data), scores };
        let state = Checkpoint {
            data_version: data.data_version.clone(), config, iteration: 0, proposals: 0, since_acceptance: 0, elapsed_seconds: 0.0,
            history: vec![Step { iteration: 0, kind: "start".into(), mean_wins: mean_wins(&scored.scores), lower_bound: 0.0 }],
            current: scored.clone(), best: scored,
        };
        Ok(Self { data, evaluator, panel, state, best: current.clone(), current })
    }

    pub fn best(&self) -> &Roster { &self.best }

    /// One iteration: screen a batch of neighbors, promote the leaders, accept a supported improvement.
    fn step(&mut self) -> Result<Option<Step>, String> {
        let config = self.state.config.clone();
        let mut random = random_stream(config.seed, &format!("hill-climb:iteration:{}", self.state.iteration));
        self.state.iteration += 1;
        if self.state.since_acceptance >= config.stall as u64 { return self.restart(&mut random).map(Some); }
        let mut proposals: Vec<Roster> = Vec::new();
        for _ in 0..config.batch * 20 {
            if proposals.len() == config.batch { break; }
            if let Some(next) = neighbor(&self.current, self.data, config.pool, &mut random) {
                if !proposals.contains(&next) { proposals.push(next); }
            }
        }
        self.state.proposals += proposals.len() as u64;
        self.state.since_acceptance += proposals.len() as u64;
        let (screen, rest) = self.panel.split_at(config.screen);
        let baseline = &self.state.current.scores;
        let screened = proposals.par_iter().map(|roster| self.evaluator.scores(roster, screen)).collect::<Result<Vec<_>, _>>()?;
        let mut leaders: Vec<usize> = (0..proposals.len()).filter(|index| paired(&screened[*index], &baseline[..config.screen]).0 > 0.0).collect();
        leaders.sort_by(|a, b| paired(&screened[*b], baseline).0.total_cmp(&paired(&screened[*a], baseline).0));
        leaders.truncate(config.promote);
        let full = leaders.par_iter().map(|&index| {
            let mut scores = screened[index].clone();
            scores.extend(self.evaluator.scores(&proposals[index], rest)?);
            Ok((index, scores))
        }).collect::<Result<Vec<_>, String>>()?;
        let Some((index, scores)) = full.into_iter().max_by(|a, b| paired(&a.1, baseline).0.total_cmp(&paired(&b.1, baseline).0)) else { return Ok(None) };
        let (_, lower) = paired(&scores, baseline);
        if lower.is_nan() || lower <= 0.0 { return Ok(None); }
        self.accept(proposals[index].clone(), scores, "move", lower).map(Some)
    }

    /// Kicks the best roster with several replacement moves and continues from there unconditionally.
    fn restart(&mut self, random: &mut Mulberry32) -> Result<Step, String> {
        let mut roster = self.best.clone();
        let mut kicks = 0;
        for _ in 0..self.state.config.kick * 50 {
            if kicks == self.state.config.kick { break; }
            if let Some(next) = neighbor(&roster, self.data, self.state.config.pool * 2, random) { roster = next; kicks += 1; }
        }
        let scores = self.evaluator.scores(&roster, &self.panel)?;
        self.accept(roster, scores, "restart", 0.0)
    }

    fn accept(&mut self, roster: Roster, scores: Vec<SeasonScore>, kind: &str, lower_bound: f64) -> Result<Step, String> {
        let step = Step { iteration: self.state.iteration, kind: kind.into(), mean_wins: mean_wins(&scores), lower_bound };
        self.state.current = Scored { roster: roster.ids(self.data), scores };
        self.state.since_acceptance = 0;
        if step.mean_wins > mean_wins(&self.state.best.scores) {
            self.best = roster.clone();
            self.state.best = self.state.current.clone();
        }
        self.current = roster;
        self.state.history.push(step.clone());
        Ok(step)
    }

    /// Runs until the budget is spent, writing the checkpoint after every accepted step.
    pub fn run(&mut self, budget: Duration, checkpoint: &Path) -> Result<(), String> {
        let started = Instant::now();
        let offset = self.state.elapsed_seconds;
        let mut last_report = Instant::now();
        write_json(checkpoint, &self.state)?;
        while started.elapsed() < budget {
            let step = self.step()?;
            self.state.elapsed_seconds = offset + started.elapsed().as_secs_f64();
            if let Some(step) = step {
                write_json(checkpoint, &self.state)?;
                eprintln!("[hill-climb] {:>5}s it {:>5} {:<7} panel {:.2} wins (best {:.2}, +{:.2} lower bound)",
                    self.state.elapsed_seconds as u64, step.iteration, step.kind, step.mean_wins, mean_wins(&self.state.best.scores), step.lower_bound);
            } else if last_report.elapsed() > Duration::from_secs(60) {
                eprintln!("[hill-climb] {:>5}s it {:>5} {} proposals, {} cached candidates, best {:.2}",
                    self.state.elapsed_seconds as u64, self.state.iteration, self.state.proposals, self.evaluator.cached_candidates(), mean_wins(&self.state.best.scores));
                last_report = Instant::now();
            }
        }
        write_json(checkpoint, &self.state)
    }
}

pub fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, serde_json::to_string_pretty(value).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, path).map_err(|error| error.to_string())
}
