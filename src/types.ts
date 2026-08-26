export type Category = '住居・賃貸'|'騒音'|'近隣トラブル'|'工事・建築'|'道路・交通'|'災害・危険'|'店舗・施設'|'周辺環境'|'その他'
export type OccurredPeriod = 'today'|'recent'|'this_month'|'date'|'unknown'
export type SourceType = 'firsthand'|'observed'|'resident_experience'|'heard_from_others'|'other'
export type Place = { id:string; name:string; address:string; lat:number; lng:number; summary:string; createdAt?:string; updatedAt?:string }
export type Post = { id:string; placeId:string; category:Category; body:string; occurredAt:string|null; occurredPeriod:OccurredPeriod; sourceType:SourceType; createdAt:string; updatedAt?:string; authorId:string|null; imageUrls:string[]; status:'published'|'pending'|'hidden'; reports:number; helpful:number; verification:string[] }
