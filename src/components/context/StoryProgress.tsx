import type { StorySnapshot } from '../../chat/rpgEvents';

export default function StoryProgress({ story, showDetails = false }: { story: StorySnapshot; showDetails?: boolean }) {
  return <section className="rpg-story" aria-label={showDetails ? 'Character story' : 'Story progress'}>
    <span className="rpg-event-label">{showDetails ? 'Your character’s story' : 'Current stage'}</span>
    <h3>{story.title}</h3>
    <p>{story.objective}</p>
    {!story.introComplete && <p className="rpg-story-progress">Question {Math.min(story.questionIndex + 1, story.questionCount)} / {story.questionCount}</p>}
    {showDetails && story.details.length > 0 && <>
      <dl>{story.details.map(detail => <div key={detail.id}>
        <dt>{detail.title}</dt><dd>{detail.answer}</dd>
      </div>)}</dl>
      <p className="rpg-story-save">{story.memoryStatus === 'synced'
        ? 'Saved to adventure · AgentCore memory synced'
        : story.memoryStatus === 'pending' ? 'Saved to adventure · Memory sync pending' : 'Saved to adventure'}</p>
    </>}
  </section>;
}
