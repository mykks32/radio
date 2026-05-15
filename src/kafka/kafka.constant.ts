const Topics = [
  // Playlist Topic
  'playlist_build',
  'track_added_manually',
  'track_started',
  'track_ended',
] as const

export type TopicsIntersection = (typeof Topics)[number]

export const KafkaTopic = Topics.reduce((acc, topic) => {
  acc[topic] = `${process.env.NODE_ENV}_${topic}`
  return acc
}, {}) as Record<TopicsIntersection, TopicsIntersection>
