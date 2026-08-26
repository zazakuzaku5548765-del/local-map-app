export type GeocodingResult={id:string;name:string;displayName:string;lat:number;lng:number;boundingBox:[number,number,number,number]|null}
type NominatimResult={place_id:number|string;display_name:string;name?:string;lat:string;lon:string;boundingbox?:string[]}
type CacheEntry={expiresAt:number;results:GeocodingResult[]}

const endpoint=(import.meta.env.VITE_GEOCODING_URL||'https://nominatim.openstreetmap.org').replace(/\/$/,'')
const cachePrefix='machikoe:geocode:'
const cacheTtl=7*24*60*60*1000
let lastRequestAt=0
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))

function readCache(key:string){
  try{const cached=JSON.parse(localStorage.getItem(cachePrefix+key)||'null') as CacheEntry|null;if(cached&&cached.expiresAt>Date.now())return cached.results;localStorage.removeItem(cachePrefix+key)}catch{/* Search works without storage. */}
  return null
}
function writeCache(key:string,results:GeocodingResult[]){try{localStorage.setItem(cachePrefix+key,JSON.stringify({expiresAt:Date.now()+cacheTtl,results}))}catch{/* Search works without storage. */}}

export async function geocode(query:string,signal?:AbortSignal){
  const normalized=query.trim().replace(/\s+/g,' ')
  if(!normalized)return []
  const key=normalized.toLocaleLowerCase('ja-JP'),cached=readCache(key)
  if(cached)return cached
  const remaining=1000-(Date.now()-lastRequestAt)
  if(remaining>0)await wait(remaining)
  if(signal?.aborted)throw new DOMException('Aborted','AbortError')
  lastRequestAt=Date.now()
  const params=new URLSearchParams({q:normalized,format:'jsonv2',limit:'5',countrycodes:'jp',addressdetails:'1','accept-language':'ja'})
  const response=await fetch(`${endpoint}/search?${params}`,{signal,headers:{Accept:'application/json'}})
  if(!response.ok)throw new Error(`Geocoding request failed: ${response.status}`)
  const data=await response.json() as NominatimResult[]
  const results=data.flatMap(item=>{const lat=Number(item.lat),lng=Number(item.lon);if(!Number.isFinite(lat)||!Number.isFinite(lng))return [];const box=item.boundingbox?.map(Number);return [{id:String(item.place_id),name:item.name?.trim()||item.display_name.split(',')[0],displayName:item.display_name,lat,lng,boundingBox:box?.length===4&&box.every(Number.isFinite)?[box[0],box[1],box[2],box[3]] as [number,number,number,number]:null}]})
  writeCache(key,results)
  return results
}
