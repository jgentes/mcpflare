/**
 * Tests for token calculator utility
 */

import { describe, it, expect } from 'vitest'
import {
	calculateTokenSavings,
	formatTokens,
	calculatePercentage,
	MCPFLARE_BASELINE_TOKENS,
	DEFAULT_UNASSESSED_TOKENS,
	type MCPTokenMetrics,
} from '../../src/utils/token-calculator'

describe('Token Calculator', () => {
	describe('formatTokens', () => {
		it('should format tokens with comma separators', () => {
			expect(formatTokens(1000)).toBe('1,000')
			expect(formatTokens(10000)).toBe('10,000')
			expect(formatTokens(100000)).toBe('100,000')
			expect(formatTokens(1000000)).toBe('1,000,000')
		})

		it('should handle small numbers', () => {
			expect(formatTokens(0)).toBe('0')
			expect(formatTokens(5)).toBe('5')
			expect(formatTokens(99)).toBe('99')
			expect(formatTokens(999)).toBe('999')
		})
	})

	describe('calculatePercentage', () => {
		it('should calculate percentage correctly', () => {
			expect(calculatePercentage(50, 100)).toBe(50)
			expect(calculatePercentage(25, 100)).toBe(25)
			expect(calculatePercentage(1, 100)).toBe(1)
		})

		it('should round to nearest integer', () => {
			expect(calculatePercentage(33, 100)).toBe(33)
			expect(calculatePercentage(67, 100)).toBe(67)
		})

		it('should handle zero total', () => {
			expect(calculatePercentage(50, 0)).toBe(0)
		})

		it('should handle zero part', () => {
			expect(calculatePercentage(0, 100)).toBe(0)
		})
	})

	describe('calculateTokenSavings', () => {
		it('should calculate savings for single guarded MCP with assessment', () => {
			const metrics: MCPTokenMetrics = {
				toolCount: 15,
				schemaChars: 7000,
				estimatedTokens: 2000,
				assessedAt: new Date().toISOString(),
			}

			const mcps = [
				{
					name: 'github',
					isGuarded: true,
					metrics,
				},
			]

			const summary = calculateTokenSavings(mcps)

			expect(summary.guardedMCPs).toBe(1)
			expect(summary.assessedMCPs).toBe(1)
			expect(summary.totalTokensWithoutGuard).toBe(2000)
			expect(summary.mcpflareTokens).toBe(MCPFLARE_BASELINE_TOKENS)
			expect(summary.tokensSaved).toBe(2000 - MCPFLARE_BASELINE_TOKENS)
			expect(summary.hasEstimates).toBe(false)
		})

		it('should calculate savings for multiple guarded MCPs', () => {
			const mcps = [
				{
					name: 'github',
					isGuarded: true,
					metrics: { toolCount: 15, schemaChars: 7000, estimatedTokens: 2000, assessedAt: '' },
				},
				{
					name: 'slack',
					isGuarded: true,
					metrics: { toolCount: 12, schemaChars: 6000, estimatedTokens: 1800, assessedAt: '' },
				},
			]

			const summary = calculateTokenSavings(mcps)

			expect(summary.guardedMCPs).toBe(2)
			expect(summary.assessedMCPs).toBe(2)
			expect(summary.totalTokensWithoutGuard).toBe(3800)
			expect(summary.tokensSaved).toBe(3800 - MCPFLARE_BASELINE_TOKENS)
			expect(summary.hasEstimates).toBe(false)
		})

		it('should use estimates for guarded MCPs without assessment', () => {
			const mcps = [
				{
					name: 'github',
					isGuarded: true,
					// No metrics - should use estimate
				},
			]

			const summary = calculateTokenSavings(mcps)

			expect(summary.guardedMCPs).toBe(1)
			expect(summary.assessedMCPs).toBe(0)
			expect(summary.totalTokensWithoutGuard).toBe(DEFAULT_UNASSESSED_TOKENS)
			expect(summary.tokensSaved).toBe(DEFAULT_UNASSESSED_TOKENS - MCPFLARE_BASELINE_TOKENS)
			expect(summary.hasEstimates).toBe(true)
		})

		it('should not count unguarded MCPs in savings', () => {
			const mcps = [
				{
					name: 'github',
					isGuarded: false,
					metrics: { toolCount: 15, schemaChars: 7000, estimatedTokens: 2000, assessedAt: '' },
				},
			]

			const summary = calculateTokenSavings(mcps)

			expect(summary.guardedMCPs).toBe(0)
			expect(summary.assessedMCPs).toBe(1) // Still counts as assessed
			expect(summary.totalTokensWithoutGuard).toBe(0) // Not guarded, so no savings
			expect(summary.tokensSaved).toBe(0)
			expect(summary.hasEstimates).toBe(false)
		})

		it('should provide breakdown per MCP', () => {
			const mcps = [
				{
					name: 'github',
					isGuarded: true,
					metrics: { toolCount: 15, schemaChars: 7000, estimatedTokens: 2000, assessedAt: '' },
				},
				{
					name: 'slack',
					isGuarded: false,
					metrics: { toolCount: 12, schemaChars: 6000, estimatedTokens: 1800, assessedAt: '' },
				},
			]

			const summary = calculateTokenSavings(mcps)

			expect(summary.mcpBreakdown).toHaveLength(2)

			const github = summary.mcpBreakdown.find(m => m.name === 'github')
			expect(github).toBeDefined()
			expect(github?.isGuarded).toBe(true)
			expect(github?.isAssessed).toBe(true)
			expect(github?.tokens).toBe(2000)
			expect(github?.toolCount).toBe(15)

			const slack = summary.mcpBreakdown.find(m => m.name === 'slack')
			expect(slack).toBeDefined()
			expect(slack?.isGuarded).toBe(false)
			expect(slack?.isAssessed).toBe(true)
			expect(slack?.tokens).toBe(0) // Not guarded, so not contributing
		})

		it('should handle empty MCP list', () => {
			const summary = calculateTokenSavings([])

			expect(summary.guardedMCPs).toBe(0)
			expect(summary.assessedMCPs).toBe(0)
			expect(summary.totalTokensWithoutGuard).toBe(0)
			expect(summary.tokensSaved).toBe(0)
			expect(summary.mcpBreakdown).toHaveLength(0)
		})

		it('should never return negative savings', () => {
			// Edge case: if somehow MCPflare tokens > guarded tokens
			const mcps = [
				{
					name: 'tiny-mcp',
					isGuarded: true,
					metrics: { toolCount: 1, schemaChars: 100, estimatedTokens: 50, assessedAt: '' },
				},
			]

			const summary = calculateTokenSavings(mcps)

			// MCPflare baseline is 500, but we only saved 50 tokens
			// Should not show negative savings
			expect(summary.tokensSaved).toBe(0) // Math.max(0, 50 - 500) = 0
		})
	})

	describe('Constants', () => {
		it('should have reasonable MCPFLARE_BASELINE_TOKENS', () => {
			expect(MCPFLARE_BASELINE_TOKENS).toBe(500)
		})

		it('should have reasonable DEFAULT_UNASSESSED_TOKENS', () => {
			expect(DEFAULT_UNASSESSED_TOKENS).toBe(800)
		})
	})
})
