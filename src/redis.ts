// import { createClient, RedisClientType } from 'redis'

// let client: RedisClientType | null = null

// export async function initRedis(url?: string): Promise<RedisClientType> {
//   if (client) return client
//   const u = url ?? process.env.REDIS_URL ?? 'redis://localhost:6379'

//   client = createClient({
//     url: u,
//     socket: {
//       reconnectStrategy: (retries) => (retries > 3 ? false : Math.min(retries * 200, 2000)),
//       connectTimeout: 2000,
//     },
//     disableOfflineQueue: true, // fail immediately when disconnected
//   })

//   client.on('error', (err) => console.error('[redis]', err.message ?? err))
//   await client.connect()
//   return client
// }

// export async function getCachedJson<T>(key: string, ttlSec: number, fetcher: () => Promise<T>): Promise<T> {
//   try {
//     if (!client) await initRedis()
//     const raw = await client!.get(key)
//     if (raw) {
//       console.log('[redis] HIT', key)
//       return JSON.parse(raw) as T
//     }
//     console.log('[redis] MISS', key)
//     const fresh = await fetcher()
//     await client!.setEx(key, ttlSec, JSON.stringify(fresh))
//     return fresh
//   } catch (e) {
//     // Fail-open: Redis errors must never break API responses.
//     console.log('[redis] ERROR (fail-open)', key)
//     return fetcher()
//   }
// }

// export async function invalidateByPrefix(prefix: string): Promise<void> {
//   try {
//     if (!client) await initRedis()
//     // NOTE: KEYS is acceptable for now because we keep prefix fan-out small.
//     const keys = await client!.keys(`${prefix}*`)
//     if (keys.length) await client!.del(keys)
//   } catch {
//     // Fail-open.
//   }
// }


import { createClient, RedisClientType } from 'redis'

let client: RedisClientType | null = null

export async function initRedis(url?: string): Promise<RedisClientType> {
  if (client) return client

  const u = url ?? process.env.REDIS_URL ?? 'redis://localhost:6379'

  client = createClient({
    url: u,
    socket: {
      reconnectStrategy: (retries) =>
        retries > 3 ? false : Math.min(retries * 200, 2000),
      connectTimeout: 2000,
    },
    disableOfflineQueue: true, // fail immediately when disconnected
  })

  client.on('error', (err) =>
    console.error('[redis]', err.message ?? err)
  )

  await client.connect()
  return client
}

export async function getCachedJson<T>(
  key: string,
  ttlSec: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    if (!client) await initRedis()

    const raw = await client!.get(key)

    if (raw) {
      console.log('[redis] HIT', key)
      return JSON.parse(raw) as T
    }

    console.log('[redis] MISS', key)

    const fresh = await fetcher()

    await client!.setEx(key, ttlSec, JSON.stringify(fresh))

    return fresh
  } catch (e) {
    // Fail-open: Redis errors must never break API responses.
    console.log('[redis] ERROR (fail-open)', key)
    return fetcher()
  }
}

export async function invalidateByPrefix(prefix: string): Promise<void> {
  try {
    if (!client) await initRedis()

    let cursor = '0'

    do {
      const reply = await client!.scan(cursor, {
        MATCH: `${prefix}*`,
        COUNT: 100,
      })

      cursor = reply.cursor

      if (reply.keys.length > 0) {
        await client!.del(reply.keys)
      }
    } while (cursor !== '0')
  } catch {
    // Fail-open.
  }
}