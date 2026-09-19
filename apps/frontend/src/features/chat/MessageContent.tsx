import { Fragment, type ReactNode } from "react";

function inlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={key}>{part.slice(1, -1)}</code>;
      }
      return <Fragment key={key}>{part}</Fragment>;
    });
}

function paragraph(lines: string[], key: string) {
  const occurrences = new Map<string, number>();
  let first = true;
  return (
    <p key={key}>
      {lines.map((line) => {
        const occurrence = (occurrences.get(line) ?? 0) + 1;
        occurrences.set(line, occurrence);
        const lineKey = `${key}-${line}-${occurrence}`;
        const breakBefore = !first;
        first = false;
        return (
          <Fragment key={lineKey}>
            {breakBefore && <br />}
            {inlineMarkdown(line, lineKey)}
          </Fragment>
        );
      })}
    </p>
  );
}

/** LLM本文の基本Markdownを、HTML挿入を使わず安全なReact要素として描画する。 */
export function MessageContent({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const content = inlineMarkdown(heading[2], `heading-${index}`);
      blocks.push(
        heading[1].length === 1 ? (
          <h2 key={`heading-${index}`}>{content}</h2>
        ) : (
          <h3 key={`heading-${index}`}>{content}</h3>
        ),
      );
      index += 1;
      continue;
    }

    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = /^\s*[-*]\s+(.+)$/.exec(lines[index]);
        if (!item) break;
        items.push(
          <li key={`bullet-${index}`}>
            {inlineMarkdown(item[1], `bullet-${index}`)}
          </li>,
        );
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{items}</ul>);
      continue;
    }

    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = /^\s*\d+[.)]\s+(.+)$/.exec(lines[index]);
        if (!item) break;
        items.push(
          <li key={`ordered-${index}`}>
            {inlineMarkdown(item[1], `ordered-${index}`)}
          </li>,
        );
        index += 1;
      }
      blocks.push(<ol key={`ordered-list-${index}`}>{items}</ol>);
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+[.)]\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(paragraph(paragraphLines, `paragraph-${index}`));
  }

  return <div className="message-content">{blocks}</div>;
}
