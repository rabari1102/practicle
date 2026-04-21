export const appConfig = () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  },
});

export const mongoConfig = () => ({
  mongo: {
    uri:
      process.env.MONGODB_URI ?? 'mongodb://localhost:27017/conversation_sessions',
    poolSize: parseInt(process.env.MONGODB_POOL_SIZE ?? '10', 10),
    connectTimeoutMs: parseInt(
      process.env.MONGODB_CONNECT_TIMEOUT_MS ?? '5000',
      10,
    ),
    serverSelectionTimeoutMs: parseInt(
      process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS ?? '5000',
      10,
    ),
  },
});
