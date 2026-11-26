import questions from '../../amplify/functions/brain/src/experiences/game_master/orchestrator/introduction.json';
import type { Message } from '../components/MessageBubble';
import type { StorySnapshot } from '../chat/rpgEvents';

/** UI fixture using the authored questions. Production rules run in Python. */
export const initialStory: StorySnapshot = {
  version: 1, stageId: 'introduction', title: 'A stranger in Alderheart',
  objective: 'Define the person arriving in town.', introComplete: false,
  questionIndex: 0, questionCount: questions.length, details: [], memoryStatus: 'local',
};
const questionText = (index: number) => `**${questions[index].prompt}**\n\n${questions[index].hint}\n\n*Question ${index + 1} of ${questions.length} · Reply in your own words, or type **skip** / **skip intro**.*`;

export function openingStory(character: { name: string; race: string; characterClass: string }): Message {
  return {
    role: 'assistant', messageId: 'intro-preview-opening', story: initialStory,
    content: `## Alderheart Market Square\n\nYou are **${character.name}**, a level 1 ${character.race} ${character.characterClass}.\n\nThe heart of Alderheart catches the low amber sun. Stalls close around you; beyond them, warm light spills from the Whispering Tankard.\n\nBefore you take your first step into this story, give this traveller a past. These questions describe your fictional character, one answer at a time.\n\n${questionText(0)}`,
    gameEvents: [{ version: 1, id: 'intro-preview-stage', kind: 'stage', title: initialStory.title, detail: initialStory.objective }],
  };
}

export function answerStory(story: StorySnapshot, content: string): Message {
  const answer = content.trim();
  if (!answer || answer.length > 1200) return { role: 'assistant', content: 'Use 1–1200 characters, or type **skip**.', story };
  if (answer.toLowerCase() === 'help' || answer === '?') return { role: 'assistant', content: questionText(story.questionIndex), story };
  const skipped = ['skip', 'skip intro'].includes(answer.toLowerCase());
  const question = questions[story.questionIndex];
  const index = answer.toLowerCase() === 'skip intro' ? questions.length : story.questionIndex + 1;
  const complete = index >= questions.length;
  const next: StorySnapshot = {
    ...story, questionIndex: index, introComplete: complete,
    details: skipped ? story.details : [...story.details, { id: question.id, title: question.title, answer }],
    ...(complete ? { stageId: 'lantern_lead', title: 'The missing light', objective: 'Meet Bram at the Whispering Tankard and accept his task.' } : {}),
  };
  return {
    role: 'assistant', messageId: crypto.randomUUID(), story: next, populateOnMount: true,
    content: (skipped ? 'That part of your past remains yours to keep.' : 'That detail is now part of your character’s story.')
      + '\n\n' + (complete
      ? 'The market bell falls quiet. Inside the **Whispering Tankard**, watch-captain **Bram Hightower** is looking for help with a missing lantern.\n\nYou can head to the tavern, explore the square, or choose your own next move. **What do you do?**'
      : questionText(index)),
    gameEvents: [
      ...(!skipped ? [{ version: 1 as const, id: `detail-${index}`, kind: 'character', title: question.title, detail: answer }] : []),
      ...(complete ? [{ version: 1 as const, id: 'stage-lantern', kind: 'stage', title: next.title, detail: next.objective }] : []),
    ],
  };
}
