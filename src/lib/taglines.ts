// Rotating taglines that combine UVP with light, humorous tone
// These change on every page refresh

export const taglines = [
  {
    headline: "Let's find the scam before it finds you.",
    subtext: "Enter a ticker to check for red flags",
  },
  {
    headline: "Because 'guaranteed returns' aren't guaranteed.",
    subtext: "Scan any stock tip in seconds",
  },
  {
    headline: "Your BS detector for stock tips.",
    subtext: "Paste a ticker, get the truth",
  },
  {
    headline: "Trust, but verify. We'll help with the verify part.",
    subtext: "Check any investment pitch for red flags",
  },
  {
    headline: "Hot tip? Let's cool it down with some facts.",
    subtext: "Enter a stock or crypto symbol",
  },
  {
    headline: "Not all that glitters is gold. Some of it is scams.",
    subtext: "Scan for pump-and-dump patterns instantly",
  },
  {
    headline: "Your uncle's stock tip? Yeah, let's check that.",
    subtext: "No judgment, just data",
  },
  {
    headline: "Scammers hate this one simple trick.",
    subtext: "It's called doing your homework. We made it easy.",
  },
  {
    headline: "Before you YOLO, let's LOLO.",
    subtext: "Look Out, Look Out for scam signals",
  },
  {
    headline: "Friend sent you a 'sure thing'? Sure, let's see.",
    subtext: "Enter the ticker below",
  },
  {
    headline: "We see red flags so you don't see red accounts.",
    subtext: "Quick, free scam detection",
  },
  {
    headline: "If it sounds too good to be true... you know the rest.",
    subtext: "Let's find out for sure",
  },
  {
    headline: "Protecting your portfolio from 'opportunities of a lifetime.'",
    subtext: "Because those come around suspiciously often",
  },
  {
    headline: "Got a tip from a stranger? Red flag #1.",
    subtext: "Let's count the rest",
  },
  {
    headline: "We're not saying it's a scam. We're saying let's check.",
    subtext: "Innocent until proven sketchy",
  },
];

export function getRandomTagline() {
  const index = Math.floor(Math.random() * taglines.length);
  return taglines[index];
}

export function getTaglineByIndex(index: number) {
  return taglines[index % taglines.length];
}
