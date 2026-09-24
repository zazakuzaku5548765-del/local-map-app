import { supabase } from './supabase'
import type { Category, ExpiryDays, OccurredPeriod, Place, Post, SourceType } from '../types'
import { compressImage, validateImageFiles } from './images'

type PlaceRow = { id:string; name:string|null; address:string|null; latitude:number; longitude:number; created_at:string; updated_at:string }
type PostRow = { id:string; place_id:string; category:Category; content:string; occurred_at:string|null; occurred_period:OccurredPeriod; source_type:SourceType; source_name:string|null; source_url:string|null; source_retrieved_at:string|null; expires_at?:string|null; created_at:string; updated_at:string; status:Post['status']; report_count:number; user_id:string|null; image_urls:string[]|null }
type PostImageRow={post_id:string;storage_path:string;sort_order:number}

const toPlace = (row:PlaceRow):Place => ({ id:row.id, name:row.name || '名称未設定の地点', address:row.address || '住所情報なし', lat:row.latitude, lng:row.longitude, summary:'地域のみなさんからの情報', createdAt:row.created_at, updatedAt:row.updated_at })
const toPost = (row:PostRow,imageUrls:string[]):Post => ({ id:row.id, placeId:row.place_id, category:row.category, body:row.content, occurredAt:row.occurred_at, occurredPeriod:row.occurred_period, sourceType:row.source_type, sourceName:row.source_name, sourceUrl:row.source_url, sourceRetrievedAt:row.source_retrieved_at, expiresAt:row.expires_at||null, createdAt:row.created_at, updatedAt:row.updated_at, authorId:row.user_id, imageUrls:[...(row.image_urls||[]),...imageUrls], status:row.status, reports:row.report_count, helpful:0, verification:row.source_type==='public_source'?['飯田市公式情報をもとにした公開情報']:['未確認'] })

export async function loadMapData():Promise<{places:Place[];posts:Post[]}> {
  if (!supabase) throw new Error('Supabase is not configured')
  const [placesResult,postsResult,imagesResult]=await Promise.all([
    supabase.from('places').select('*').order('created_at', { ascending:true }),
    supabase.from('posts').select('*').eq('status','published').order('created_at',{ascending:false}),
    supabase.from('post_images').select('post_id,storage_path,sort_order').is('deleted_at',null).order('sort_order',{ascending:true})
  ])
  if (placesResult.error) throw placesResult.error
  if (postsResult.error) throw postsResult.error
  if(imagesResult.error&&imagesResult.error.code!=='42P01')console.warn('Post images could not be loaded',imagesResult.error)
  const imageRows=imagesResult.error?[]:imagesResult.data as PostImageRow[]
  const imageUrls=new Map<string,string[]>()
  for(const image of imageRows){const url=supabase.storage.from('post-images').getPublicUrl(image.storage_path).data.publicUrl;imageUrls.set(image.post_id,[...(imageUrls.get(image.post_id)||[]),url])}
  const now=Date.now()
  const posts=(postsResult.data as PostRow[]).filter(row=>!row.expires_at||new Date(row.expires_at).getTime()>now).map(row=>toPost(row,imageUrls.get(row.id)||[]))
  const activeIds=new Set(posts.map(post=>post.placeId))
  return { places:(placesResult.data as PlaceRow[]).map(toPlace).filter(place=>activeIds.has(place.id)), posts }
}

export type NewPostInput = { placeId?:string; latitude:number; longitude:number; placeName:string|null; address:string|null; category:Category; content:string; occurredAt:string|null; occurredPeriod:OccurredPeriod; sourceType:SourceType; expiryDays:ExpiryDays }
export type SavedPost={placeId:string;postId:string;uploadToken:string}

export async function savePost(input:NewPostInput):Promise<SavedPost> {
  if (!supabase) throw new Error('Supabase is not configured')
  const {data,error}=await supabase.rpc('create_place_with_post_v2',{p_place_id:input.placeId||null,p_latitude:input.latitude,p_longitude:input.longitude,p_name:input.placeName,p_address:input.address,p_category:input.category,p_content:input.content,p_occurred_at:input.occurredAt,p_occurred_period:input.occurredPeriod,p_source_type:input.sourceType,p_expiry_days:input.expiryDays})
  if(error) throw error
  const result=data as {place_id?:string;post_id?:string;upload_token?:string}|null
  if(!result?.place_id||!result.post_id||!result.upload_token)throw new Error('Post IDs were not returned')
  return {placeId:result.place_id,postId:result.post_id,uploadToken:result.upload_token}
}

export async function uploadPostImages(saved:SavedPost,files:File[]){
  if(!supabase||!files.length)return []
  validateImageFiles(files)
  const paths:string[]=[]
  try{
    for(const file of files){
      const blob=await compressImage(file)
      const path=`${saved.postId}/${saved.uploadToken}/${crypto.randomUUID()}.webp`
      const {error}=await supabase.storage.from('post-images').upload(path,blob,{contentType:'image/webp',cacheControl:'31536000',upsert:false})
      if(error)throw error
      paths.push(path)
    }
    const {error}=await supabase.rpc('attach_post_images',{p_post_id:saved.postId,p_upload_token:saved.uploadToken,p_paths:paths})
    if(error)throw error
    return paths.map(path=>supabase!.storage.from('post-images').getPublicUrl(path).data.publicUrl)
  }catch(error){
    if(paths.length)await supabase.storage.from('post-images').remove(paths)
    throw error
  }
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
