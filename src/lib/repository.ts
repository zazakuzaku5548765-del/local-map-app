import { supabase } from './supabase'
import type { Category, OccurredPeriod, Place, Post, SourceType } from '../types'

type PlaceRow = { id:string; name:string|null; address:string|null; latitude:number; longitude:number; created_at:string; updated_at:string }
type PostRow = { id:string; place_id:string; category:Category; content:string; occurred_at:string|null; occurred_period:OccurredPeriod; source_type:SourceType; created_at:string; updated_at:string; status:Post['status']; report_count:number; user_id:string|null; image_urls:string[]|null }

const toPlace = (row:PlaceRow):Place => ({ id:row.id, name:row.name || '名称未設定の地点', address:row.address || '住所情報なし', lat:row.latitude, lng:row.longitude, summary:'地域のみなさんからの情報', createdAt:row.created_at, updatedAt:row.updated_at })
const toPost = (row:PostRow):Post => ({ id:row.id, placeId:row.place_id, category:row.category, body:row.content, occurredAt:row.occurred_at, occurredPeriod:row.occurred_period, sourceType:row.source_type, createdAt:row.created_at, updatedAt:row.updated_at, authorId:row.user_id, imageUrls:row.image_urls || [], status:row.status, reports:row.report_count, helpful:0, verification:['未確認'] })

export async function loadMapData():Promise<{places:Place[];posts:Post[]}> {
  if (!supabase) throw new Error('Supabase is not configured')
  const [placesResult, postsResult] = await Promise.all([
    supabase.from('places').select('*').order('created_at', { ascending:true }),
    supabase.from('posts').select('*').eq('status','published').order('created_at', { ascending:false })
  ])
  if (placesResult.error) throw placesResult.error
  if (postsResult.error) throw postsResult.error
  const posts=(postsResult.data as PostRow[]).map(toPost)
  const activeIds=new Set(posts.map(post=>post.placeId))
  return { places:(placesResult.data as PlaceRow[]).map(toPlace).filter(place=>activeIds.has(place.id)), posts }
}

export type NewPostInput = { placeId?:string; latitude:number; longitude:number; placeName:string|null; address:string|null; category:Category; content:string; occurredAt:string|null; occurredPeriod:OccurredPeriod; sourceType:SourceType }

export async function savePost(input:NewPostInput):Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  if (input.placeId) {
    const { data:sessionData }=await supabase.auth.getSession()
    const { error }=await supabase.from('posts').insert({ place_id:input.placeId, category:input.category, content:input.content, occurred_at:input.occurredAt, occurred_period:input.occurredPeriod, source_type:input.sourceType, status:'published', user_id:sessionData.session?.user.id || null })
    if(error) throw error
    return input.placeId
  }
  const { data,error }=await supabase.rpc('create_place_with_post', { p_latitude:input.latitude, p_longitude:input.longitude, p_name:input.placeName, p_address:input.address, p_category:input.category, p_content:input.content, p_occurred_at:input.occurredAt, p_occurred_period:input.occurredPeriod, p_source_type:input.sourceType })
  if(error) throw error
  if(!data)throw new Error('Place ID was not returned')
  return String(data)
}

export async function reportPost(postId:string, reason='other'):Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error }=await supabase.rpc('report_post', { p_post_id:postId, p_reason:reason })
  if(error) throw error
}

export function distanceMeters(a:{lat:number;lng:number},b:{lat:number;lng:number}) {
  const radius=6371000, rad=Math.PI/180
  const dLat=(b.lat-a.lat)*rad, dLng=(b.lng-a.lng)*rad
  const value=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2
  return 2*radius*Math.asin(Math.sqrt(value))
}
