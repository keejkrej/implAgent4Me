// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/coding-agent/src/tools/yield.ts
// Lines: 1-80
// impl Agent: see AGENTS.md

/**
 * Submit result tool for structured subagent output.
 *
 * Subagents must call this tool to finish and return structured JSON output.
 */
import type { AgentTool, AgentToolContext, AgentToolResult, AgentToolUpdateCallback } from "@oh-my-pi/pi-agent-core";
import type { TSchema } from "@oh-my-pi/pi-ai/types";
import {
	dereferenceJsonSchema,
	isValidJsonSchema,
	type JsonSchemaValidationResult,
	sanitizeSchemaForStrictMode,
	tryEnforceStrictSchema,
} from "@oh-my-pi/pi-ai/utils/schema";
import { subprocessToolRegistry } from "../task/subprocess-tool-registry";
import type { ToolSession } from ".";
import { buildOutputValidator, formatAllValidationIssues } from "./output-schema-validator";

export interface YieldDetails {
	data: unknown;
	status: "success" | "aborted";
	error?: string;
	/**
	 * Set when the yield tool exhausted its in-tool schema-retry budget
	 * (MAX_SCHEMA_RETRIES) and accepted the data anyway. Surfaced so the
	 * executor's post-mortem finalizer can honor the override instead of
	 * re-rejecting the same payload with `schema_violation` — keeping the
	 * subagent's acceptance and the parent's view of the result in lockstep.
	 */
	schemaOverridden?: boolean;
}

function formatSchema(schema: unknown): string {
	if (schema === undefined) return "No schema provided.";
	if (typeof schema === "string") return schema;
	try {
		return JSON.stringify(schema, null, 2);
	} catch {
		return "[unserializable schema]";
	}
}

function looseRecordSchema(description: string): Record<string, unknown> {
	return {
		type: "object",
		additionalProperties: true,
		description,
	};
}

function hasUnresolvedRefs(schema: unknown): boolean {
	if (schema == null) return false;
	if (Array.isArray(schema)) {
		for (const item of schema) {
			if (hasUnresolvedRefs(item)) return true;
		}
		return false;
	}
	if (typeof schema !== "object") return false;
	const record = schema as Record<string, unknown>;
	if (typeof record.$ref === "string") return true;
	for (const key in record) {
		if (key === "const" || key === "default" || key === "enum" || key === "examples") continue;
		if (hasUnresolvedRefs(record[key])) return true;
	}
	return false;
}

function wrapYieldParameters(dataSchema: Record<string, unknown>): Record<string, unknown> {
	return {
		type: "object",
		additionalProperties: false,
		description: "submit data or error",
		properties: {
			result: {
				anyOf: [
					{
						type: "object",
						additionalProperties: false,
						description: "task succeeded",
