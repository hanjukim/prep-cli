import type { SetupPrompt } from "./types.ts";

/**
 * The only place that reads from the terminal.
 *
 * Same boundary probe.ts holds over the shell and setup.ts over the file
 * system: everything that decides is handed a `SetupPrompt` and never reaches
 * for stdin itself, so approval, refusal, and every conflict answer are covered
 * by tests that type nothing.
 */

/** Only an explicit yes is a yes. A stream that has ended reads as no. */
function saidYes(answer: string | null): boolean {
  return answer !== null && /^y(es)?$/i.test(answer.trim());
}

export const terminalPrompt: SetupPrompt = {
  show: (text) => process.stdout.write(text),
  confirm: (question) => saidYes(prompt(`${question} [y/N]`)),
  choose: (conflict) => {
    const answer = prompt(
      `${conflict.key}: keep yours (${conflict.existing}) or use the preset (${conflict.preset})? [keep/use]`,
    );
    // Keeping is the default here for the same reason no is the default above:
    // the value in the file is somebody's decision, and silence must not undo it.
    return answer !== null && /^u(se)?$/i.test(answer.trim()) ? "preset" : "existing";
  },
};

/** Whether there is a person on the other end. A pipe gets no questions and no write. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
