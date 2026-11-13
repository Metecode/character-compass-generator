/**
 * Odanın Realtime Broadcast kanalı (yalnızca /r/{code} sayfasının parçasında yüklenir).
 *
 * Kanal yalnızca içi boş sinyal taşır ("changed": herkes yeniden çeker, "admin":
 * yalnızca admin). Oyun verisi kanaldan geçmez; istemci sinyal alınca
 * get-room-state ile kendi görünümünü çeker. Public kanal; konu adı (room-{channel_id})
 * yalnızca katılmış oyuncunun durum yanıtında döner. Her oyuncu tek bağlantı açar.
 */

import { RealtimeClient, type RealtimeChannel } from '@supabase/realtime-js'
import { config } from './apiClient'

export type RoomSignal = 'changed' | 'admin'

export interface RoomChannelHandle {
  close: () => void
}

export function openRoomChannel(
  topic: string,
  onSignal: (event: RoomSignal) => void,
  onConnected: (connected: boolean) => void,
): RoomChannelHandle {
  const { url, key } = config()
  const client = new RealtimeClient(`${url}/realtime/v1`, {
    params: { apikey: key },
    heartbeatIntervalMs: 25_000,
  })
  let closed = false
  const channel: RealtimeChannel = client.channel(topic, { config: { broadcast: { self: false, ack: false } } })
  channel.on('broadcast', { event: 'changed' }, () => onSignal('changed'))
  channel.on('broadcast', { event: 'admin' }, () => onSignal('admin'))
  channel.subscribe((status) => {
    if (closed) return
    // Kopunca realtime-js kendisi yeniden bağlanıp kanala yeniden katılır.
    onConnected(status === 'SUBSCRIBED')
  })
  return {
    close: () => {
      closed = true
      void client.removeChannel(channel).finally(() => client.disconnect())
    },
  }
}
