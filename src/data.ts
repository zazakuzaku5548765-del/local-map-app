import type { Category, Place, Post } from './types'
export const categories: {name:Category; icon:string}[] = [
  {name:'住居・賃貸',icon:'⌂'},{name:'騒音',icon:'◖'},{name:'近隣トラブル',icon:'◎'},
  {name:'工事・建築',icon:'△'},{name:'道路・交通',icon:'↗'},{name:'災害・危険',icon:'!'},
  {name:'店舗・施設',icon:'□'},{name:'周辺環境',icon:'♧'},{name:'その他',icon:'•••'}
]
export const seedPlaces: Place[] = [
  {id:'iida-station',name:'飯田駅周辺',address:'長野県飯田市上飯田',lat:35.5197,lng:137.8219,summary:'駅周辺の暮らし・交通情報'},
  {id:'ringo-namiki',name:'りんご並木周辺',address:'長野県飯田市本町',lat:35.5147,lng:137.8247,summary:'歩行者空間と周辺環境の情報'},
  {id:'kanae-area',name:'鼎エリア',address:'長野県飯田市鼎',lat:35.5039,lng:137.8212,summary:'住環境についての地域情報'}
]
export const seedPosts: Post[] = [
  {id:'post-1',placeId:'iida-station',category:'道路・交通',body:'朝の通勤時間帯は駅前の送迎車が増えます。横断するときは少し注意が必要です。',occurredAt:null,occurredPeriod:'recent',sourceType:'observed',createdAt:'2026-08-24T09:00:00+09:00',authorId:'user-demo-1',imageUrls:[],status:'published',reports:0,helpful:8,verification:['同様の報告あり']},
  {id:'post-2',placeId:'ringo-namiki',category:'周辺環境',body:'日中は歩きやすく、ベンチもあります。夕方は散歩する人が多い印象です。',occurredAt:null,occurredPeriod:'this_month',sourceType:'firsthand',createdAt:'2026-08-20T18:30:00+09:00',authorId:'user-demo-2',imageUrls:[],status:'published',reports:0,helpful:12,verification:['写真確認済み']},
  {id:'post-3',placeId:'kanae-area',category:'住居・賃貸',body:'大通りから少し入ると比較的静かです。時間帯によって車の音に差があります。',occurredAt:null,occurredPeriod:'recent',sourceType:'resident_experience',createdAt:'2026-08-18T12:00:00+09:00',authorId:'user-demo-3',imageUrls:[],status:'published',reports:0,helpful:5,verification:['未確認']}
]
