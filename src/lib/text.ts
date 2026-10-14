/** Ends `text` with exactly one period, so a reason that already has one doesn't print "..". */
export const sentence = (text: string) => `${text.trimEnd().replace(/\.+$/, "")}.`;
