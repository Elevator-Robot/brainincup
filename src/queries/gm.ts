import { queryOptions } from '@tanstack/react-query';
import type { Schema } from '../../amplify/data/resource';
import { dataClient } from '../api/dataClient';
import { pickLatestAdventure } from '../utils/gmLocations';

export type AdventureRecord = Schema['GameMasterAdventure']['type'];
export type QuestStepRecord = Schema['GameMasterQuestStep']['type'];
export type CharacterRecord = Schema['GameMasterCharacter']['type'];
export type ConversationRecord = Schema['Conversation']['type'];

export const gmKeys = {
  conversation: (conversationId: string) => ['conversation', conversationId] as const,
  character: (conversationId: string) => ['gm', conversationId, 'character'] as const,
  adventure: (conversationId: string) => ['gm', conversationId, 'adventure'] as const,
  questSteps: (adventureId: string) => ['gm', 'adventure', adventureId, 'quest-steps'] as const,
};

const CHARACTER_PAGE_LIMIT = 50;
const CHARACTER_MAX_PAGES = 6;

const findCharacterByConversation = async (conversationId: string): Promise<CharacterRecord | null> => {
  const findMatch = (items: CharacterRecord[] | null | undefined): CharacterRecord | null =>
    (items ?? []).find((character) => character?.conversationId === conversationId) ?? null;

  try {
    const filtered = await dataClient.models.GameMasterCharacter.list({
      filter: { conversationId: { eq: conversationId } },
      limit: 1,
      authMode: 'userPool',
    });
    const directMatch = findMatch(filtered.data as CharacterRecord[] | undefined);
    if (directMatch) return directMatch;
  } catch (filteredError) {
    console.warn('Filtered character lookup failed, using paginated fallback:', filteredError);
  }

  const fetchPaginated = async (authMode?: 'userPool'): Promise<CharacterRecord | null> => {
    let cursor: string | null | undefined;
    for (let page = 0; page < CHARACTER_MAX_PAGES; page += 1) {
      const result: { data?: CharacterRecord[]; nextToken?: string | null } = authMode
        ? await dataClient.models.GameMasterCharacter.list({
          limit: CHARACTER_PAGE_LIMIT,
          nextToken: cursor ?? undefined,
          authMode,
        })
        : await dataClient.models.GameMasterCharacter.list({
          limit: CHARACTER_PAGE_LIMIT,
          nextToken: cursor ?? undefined,
        });

      const match = findMatch(result.data);
      if (match) return match;

      cursor = result.nextToken;
      if (!cursor) break;
    }
    return null;
  };

  try {
    return await fetchPaginated('userPool');
  } catch (authError) {
    console.warn('User pool character pagination failed, retrying default auth mode:', authError);
    return fetchPaginated();
  }
};

export const characterQuery = (conversationId: string) => queryOptions({
  queryKey: gmKeys.character(conversationId),
  queryFn: () => findCharacterByConversation(conversationId),
  staleTime: 60_000,
});

export const adventureQuery = (conversationId: string) => queryOptions({
  queryKey: gmKeys.adventure(conversationId),
  queryFn: async (): Promise<AdventureRecord | null> => {
    const { data } = await dataClient.models.GameMasterAdventure.list({
      filter: { conversationId: { eq: conversationId } },
      authMode: 'userPool',
    });
    return pickLatestAdventure((data as AdventureRecord[] | null | undefined) ?? null);
  },
});

export const questStepsQuery = (adventureId: string) => queryOptions({
  queryKey: gmKeys.questSteps(adventureId),
  queryFn: async (): Promise<QuestStepRecord[]> => {
    const { data } = await dataClient.models.GameMasterQuestStep.list({
      filter: { adventureId: { eq: adventureId } },
      limit: 200,
    });
    return ((data ?? []).filter(Boolean) as QuestStepRecord[])
      .sort((a, b) => ((a?.createdAt ?? '') < (b?.createdAt ?? '') ? -1 : 1));
  },
});

export const conversationQuery = (conversationId: string) => queryOptions({
  queryKey: gmKeys.conversation(conversationId),
  queryFn: async (): Promise<ConversationRecord | null> => {
    const { data } = await dataClient.models.Conversation.get({ id: conversationId });
    return data ?? null;
  },
});
