const IOS_OPEN_LINK_PROMPT_HANDLER = `- runFlow:
    when:
      platform: iOS
      visible:
        text: "Open in .*"
    commands:
      - tapOn:
          text: "Open"`;

const IOS_DEV_MENU_ONBOARDING_HANDLER = `- runFlow:
    when:
      platform: iOS
      visible:
        text: "This is the developer menu.*"
    commands:
      - tapOn:
          text: "Continue"`;

const IOS_POST_OPEN_LINK_HANDLERS = [IOS_OPEN_LINK_PROMPT_HANDLER, IOS_DEV_MENU_ONBOARDING_HANDLER].join('\n\n');

function indentBlock(block: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return block
    .split('\n')
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join('\n');
}

/**
 * Injects Maestro conditional handlers after each openLink step so common iOS
 * simulator overlays after deep links are dismissed when present.
 */
export function injectIosPostOpenLinkHandlers(yaml: string): string {
  const lines = yaml.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const openLinkMatch = line.match(/^(\s*)- openLink:\s*$/);

    if (openLinkMatch) {
      const baseIndent = openLinkMatch[1]!.length;
      result.push(line);
      i++;

      while (i < lines.length) {
        const nextLine = lines[i]!;
        if (nextLine.trim() === '') {
          break;
        }
        const nextIndent = nextLine.match(/^(\s*)/)?.[1]?.length ?? 0;
        if (nextIndent > baseIndent) {
          result.push(nextLine);
          i++;
        } else {
          break;
        }
      }

      result.push(indentBlock(IOS_POST_OPEN_LINK_HANDLERS, baseIndent));
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}
