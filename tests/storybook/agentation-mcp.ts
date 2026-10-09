import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface PendingAnnotation {
	id: string;
	comment: string;
	element: string;
	elementPath: string;
	url: string;
}

interface PendingResponse {
	count: number;
	annotations: PendingAnnotation[];
}

function toolData<T>(result: CallToolResult): T {
	if (result.isError) throw new Error('Agentation MCP tool returned an error');
	const content = result.content.find(entry => entry.type === 'text');
	if (!content || content.type !== 'text') throw new Error('Agentation MCP tool returned no text payload');
	return JSON.parse(content.text) as T;
}

export interface AgentationMcpClient {
	getAllPending(): Promise<PendingResponse>;
	resolve(annotationId: string): Promise<void>;
	close(): Promise<void>;
}

export async function connectAgentationMcp(
	endpoint = 'http://127.0.0.1:4748'
): Promise<AgentationMcpClient> {
	const transport = new StdioClientTransport({
		command: 'npx',
		args: [
			'--no-install',
			'agentation-mcp',
			'server',
			'--mcp-only',
			'--http-url',
			endpoint
		],
		cwd: process.cwd(),
		stderr: 'inherit'
	});
	const client = new Client({ name: 'storybook-feedback-test', version: '1.0.0' });
	await client.connect(transport);

	return {
		async getAllPending() {
			return toolData<PendingResponse>(await client.callTool({
				name: 'agentation_get_all_pending',
				arguments: {}
			}));
		},
		async resolve(annotationId) {
			toolData(await client.callTool({
				name: 'agentation_resolve',
				arguments: { annotationId, summary: 'Resolved by isolated Storybook verification' }
			}));
		},
		async close() {
			try {
				await client.close();
			} finally {
				await transport.close();
			}
		}
	};
}
