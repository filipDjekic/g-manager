import { apiClient } from './client'
import { useAuthStore } from '../auth/authStore'
import type { GamingOperationsBoard, GamingSession, GamingSessionEvent, StartGamingSessionInput } from '../types/gamingSession.types'

const command = (key:string) => ({ headers:{ 'Idempotency-Key':key } })
export const gamingSessionApi = {
  active: () => apiClient.get<GamingSession[]>('/gaming-sessions').then(({data}) => data),
  board: (locationId?:string) => apiClient.get<GamingOperationsBoard>('/gaming-operations/board',
    {params:locationId?{locationId}:undefined}).then(({data}) => data),
  get: (id:string) => apiClient.get<GamingSession>(`/gaming-sessions/${id}`).then(({data}) => data),
  start: (request:StartGamingSessionInput,key:string) =>
    apiClient.post<GamingSession>('/gaming-sessions',request,command(key)).then(({data}) => data),
  extend: (id:string,minutes:number,version:number,key:string) =>
    apiClient.post<GamingSession>(`/gaming-sessions/${id}/extend`,{minutes,version},command(key)).then(({data}) => data),
  terminate: (id:string,reason:string,version:number,key:string) =>
    apiClient.post<GamingSession>(`/gaming-sessions/${id}/terminate`,{reason,version},command(key)).then(({data}) => data),
  forceLock: (stationId:string) => apiClient.post(`/gaming-operations/stations/${stationId}/force-lock`),
  confirmLocked: (stationId:string) => apiClient.post(`/gaming-operations/stations/${stationId}/confirm-locked`),
}

export function connectGamingSessionStream(onEvent:(event:GamingSessionEvent)=>void) {
  const controller=new AbortController();let attempt=0
  async function run(){while(!controller.signal.aborted){try{
    const token=useAuthStore.getState().accessToken
    const response=await fetch(`${import.meta.env.VITE_API_URL??'/api/v1'}/gaming-sessions/stream`,{
      headers:{Accept:'text/event-stream',...(token?{Authorization:`Bearer ${token}`}:{})},credentials:'include',signal:controller.signal})
    if(response.status===401){await gamingSessionApi.active();throw new Error('SSE authorization refresh')}
    if(!response.ok||!response.body)throw new Error(`SSE ${response.status}`)
    attempt=0;await consume(response.body,onEvent)
  }catch{if(controller.signal.aborted)break;attempt+=1;await delay(Math.min(30000,1000*2**Math.min(attempt,5)))}}}
  void run();return()=>controller.abort()
}
async function consume(stream:ReadableStream<Uint8Array>,emit:(event:GamingSessionEvent)=>void){
  const reader=stream.getReader();const decoder=new TextDecoder();let buffer=''
  while(true){const{done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n')
    let boundary=buffer.indexOf('\n\n');while(boundary>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2)
      const event=block.split('\n').find(line=>line.startsWith('event:'))?.slice(6).trim()
      const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n')
      if(event==='gaming-session'&&data)emit(JSON.parse(data) as GamingSessionEvent);boundary=buffer.indexOf('\n\n')}}}
function delay(ms:number){return new Promise(resolve=>window.setTimeout(resolve,ms))}
