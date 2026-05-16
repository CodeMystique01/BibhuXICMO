import {
  strategyPipeline,
  StrategyPipeline,
  strategySchema,
  type Strategy,
} from "@/backend/pipelines/strategy.pipeline";

export { strategyPipeline, StrategyPipeline, strategySchema, type Strategy };

/** @deprecated Prefer `strategyPipeline.generate()` in new code. */
export async function generateStrategy(input: {
  workspaceId: string;
  websiteUrl: string;
}) {
  return strategyPipeline.generate(input);
}
