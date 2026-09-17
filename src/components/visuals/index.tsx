import type { Visual } from "../../schema/script.ts";
import { ChartVisual } from "./ChartVisual.tsx";
import { CodeVisual } from "./CodeVisual.tsx";
import { TextVisual } from "./TextVisual.tsx";

export const VisualSlot: React.FC<{ visual: Visual }> = ({ visual }) => {
  switch (visual.kind) {
    case "text":
      return <TextVisual lead={visual.lead} />;
    case "chart":
      return <ChartVisual data={visual.data} />;
    case "code":
      return <CodeVisual before={visual.before} after={visual.after} lang={visual.lang} />;
    case "screencast":
      // ToolDemo（M5）で実装する。lint が先に落とすのでここには来ない
      throw new Error("visual.kind=screencast は未実装（plan.md M5）");
    default: {
      const never: never = visual;
      throw new Error(`知らない visual: ${JSON.stringify(never)}`);
    }
  }
};
