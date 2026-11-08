import { useEffect } from "react";
import { tearcopy, type TearcopyOptions } from "./index";

export type { Corner, Paper, ReducedMotion, TearInfo, TearcopyOptions } from "./index";

/** Start tearcopy while this component is mounted. Re-subscribes when options change. */
export function useTearcopy(options: TearcopyOptions = {}): void {
  const { root, paper, corner, duration, maxLines, reducedMotion, onTear } = options;
  useEffect(() => {
    return tearcopy({ root, paper, corner, duration, maxLines, reducedMotion, onTear });
  }, [root, paper, corner, duration, maxLines, reducedMotion, onTear]);
}
