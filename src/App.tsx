import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { AlertCircle, Check, ChevronLeft, Filter, Flag, LoaderCircle, LocateFixed, MapPin, Plus, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import { categories, seedPlaces, seedPosts } from './data'
import type { Category, OccurredPeriod, Place, Post, SourceType } from './types'
import { isSupabaseConfigured } from './lib/supabase'
import { distanceMeters, loadMapData, reportPost, savePost } from './lib/repository'
import { geocode, type GeocodingResult } from './lib/geocoding'
import { privacySafeSearchTerm, trackEvent } from './lib/analytics'
const defaultPinIcon=L.divIcon({className:'map-marker',html:'<span class="pin"><i></i></span>',iconSize:[38,48],iconAnchor:[19,44]})
const activePinIcon=L.divIcon({className:'map-marker',html:'<span class="pin active"><i></i></span>',iconSize:[38,48],iconAnchor:[19,44]})
const draftIcon=L.divIcon({className:'map-marker',html:'<span class="pin draft"><i></i></span>',iconSize:[38,48],iconAnchor:[19,44]})
const searchIcon=L.divIcon({className:'map-marker',html:'<span class="pin search-pin"><i></i></span>',iconSize:[38,48],iconAnchor:[19,44]})

function MapController({locateToken,searchTarget,onLocationError,onLocationFound}:{locateToken:number;searchTarget:GeocodingResult|null;onLocationError:()=>void;onLocationFound:()=>void}){
  const map=useMap()
  useMapEvents({
    locationerror:()=>{map.stopLocate();onLocationError()},
    locationfound:()=>{requestAnimationFrame(()=>map.invalidateSize({pan:false,debounceMoveend:true}));onLocationFound()}
  })
  useEffect(()=>{
    const container=map.getContainer()
    let frame=0
    const updateSize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>map.invalidateSize({pan:false,debounceMoveend:true}))}
    const observer=new ResizeObserver(updateSize)
    const onVisible=()=>{if(document.visibilityState==='visible')updateSize()}
    observer.observe(container);window.addEventListener('resize',updateSize,{passive:true});window.addEventListener('orientationchange',updateSize);document.addEventListener('visibilitychange',onVisible);updateSize()
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',updateSize);window.removeEventListener('orientationchange',updateSize);document.removeEventListener('visibilitychange',onVisible)}
  },[map])
  useEffect(()=>{if(!locateToken)return;map.stop();map.locate({setView:true,maxZoom:15,enableHighAccuracy:false,timeout:8000,maximumAge:60000})},[locateToken,map])
  useEffect(()=>{
    if(!searchTarget)return
    map.stop()
    if(searchTarget.boundingBox){const [south,north,west,east]=searchTarget.boundingBox;map.fitBounds([[south,west],[north,east]],{padding:[36,36],maxZoom:17,animate:false})}
    else map.setView([searchTarget.lat,searchTarget.lng],16,{animate:false})
  },[map,searchTarget])
  return null
}
function MapClick({onPick}:{onPick:(p:{lat:number;lng:number})=>void}){useMapEvents({click:e=>onPick(e.latlng)});return null}

type View='map'|'place'
const periodOptions:{value:OccurredPeriod;label:string}[]=[{value:'today',label:'今日'},{value:'recent',label:'最近'},{value:'this_month',label:'今月'},{value:'date',label:'日付指定'},{value:'unknown',label:'時期不明'}]
const sourceOptions:{value:SourceType;label:string}[]=[{value:'firsthand',label:'自分で体験した'},{value:'observed',label:'現地で確認した'},{value:'resident_experience',label:'居住経験がある'},{value:'heard_from_others',label:'他人から聞いた'},{value:'other',label:'その他'}]
const periodLabel=(post:Post)=>post.occurredPeriod==='date'&&post.occurredAt?`${new Date(`${post.occurredAt}T00:00:00`).toLocaleDateString('ja-JP')}頃`:periodOptions.find(x=>x.value===post.occurredPeriod)?.label||'時期不明'
export default function App(){
  const [posts,setPosts]=useState<Post[]>(isSupabaseConfigured?[]:seedPosts)
  const [places,setPlaces]=useState<Place[]>(isSupabaseConfigured?[]:seedPlaces)
  const [selected,setSelected]=useState<string|null>(null)
  const [draftPoint,setDraftPoint]=useState<{lat:number;lng:number}|null>(null)
  const [composer,setComposer]=useState(false)
  const [filtersOpen,setFiltersOpen]=useState(false)
  const [activeCats,setActiveCats]=useState<Category[]>(categories.map(c=>c.name))
  const [query,setQuery]=useState('')
  const [searchResults,setSearchResults]=useState<GeocodingResult[]>([])
  const [searchTarget,setSearchTarget]=useState<GeocodingResult|null>(null)
  const [searching,setSearching]=useState(false)
  const [searchError,setSearchError]=useState('')
  const [locateToken,setLocateToken]=useState(0)
  const [view,setView]=useState<View>('map')
  const [toast,setToast]=useState('')
  const [loading,setLoading]=useState(isSupabaseConfigured)
  const [loadError,setLoadError]=useState(false)
  const refresh=async()=>{
    if(!isSupabaseConfigured)return
    setLoading(true);setLoadError(false)
    try{const data=await loadMapData();setPlaces(data.places);setPosts(data.posts)}
    catch(error){console.error('Supabase data load failed',error);setLoadError(true)}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])
  const selectedPlace=places.find(p=>p.id===selected)||null
  const visiblePlaces=useMemo(()=>places.filter(p=>posts.some(x=>x.placeId===p.id&&activeCats.includes(x.category))),[places,posts,activeCats])
  const placePosts=(id:string)=>posts.filter(p=>p.placeId===id&&p.status==='published').sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  const submit=async(data:{category:Category;body:string;occurredAt:string|null;occurredPeriod:OccurredPeriod;sourceType:SourceType;files:File[];placeName:string})=>{
    if(!isSupabaseConfigured)throw new Error('Supabase is not configured')
    const point=selectedPlace?{lat:selectedPlace.lat,lng:selectedPlace.lng}:draftPoint
    if(!point)throw new Error('Location is not selected')
    const placeId=await savePost({placeId:selectedPlace?.id,latitude:point.lat,longitude:point.lng,placeName:data.placeName||null,address:selectedPlace?.address||null,category:data.category,content:data.body,occurredAt:data.occurredAt,occurredPeriod:data.occurredPeriod,sourceType:data.sourceType})
    trackEvent('post_complete',{place_id:placeId,categories:data.category,source_type:data.sourceType})
    await refresh();setComposer(false);setDraftPoint(null);setToast('投稿を公開しました');setTimeout(()=>setToast(''),2600)
  }
  const chooseSearchResult=(result:GeocodingResult)=>{setSearchTarget(result);setSearchResults([]);setSearchError('');setSelected(null);setDraftPoint(null);showToast(`${result.name}へ移動しました`)}
  const search=async(e:React.FormEvent)=>{
    e.preventDefault();if(!query.trim()||searching)return
    trackEvent('search',{search_term:privacySafeSearchTerm(query)})
    setSearching(true);setSearchError('');setSearchResults([])
    try{const results=await geocode(query);if(!results.length){setSearchError('場所が見つかりませんでした');showToast('場所が見つかりませんでした');return}chooseSearchResult(results[0]);setSearchResults(results.length>1?results:[])}
    catch(error){console.error('Place search failed',error);setSearchError('場所を検索できませんでした。時間をおいてもう一度お試しください')}
    finally{setSearching(false)}
  }
  const handleReport=async(id:string)=>{const reason='unspecified';try{await reportPost(id,reason);trackEvent('report_submit',{post_id:id,reason});setPosts(v=>v.map(p=>p.id===id?{...p,reports:p.reports+1}:p));setToast('通報を受け付けました')}catch(error){console.error('Report failed',error);setToast('通報を送信できませんでした')}}
  const showToast=(message:string)=>{setToast(message);setTimeout(()=>setToast(''),3500)}
  const startPost=()=>{trackEvent('post_start',selectedPlace?{place_id:selectedPlace.id}:{});setComposer(true)}
  if(view==='place'&&selectedPlace)return <PlaceDetail place={selectedPlace} posts={placePosts(selectedPlace.id)} onBack={()=>setView('map')} onPost={startPost} onReport={handleReport} toast={toast}/>
  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={()=>setSelected(null)}><span className="brand-mark"><MapPin size={18}/></span><span><b>まちこえ</b><small>場所から知る、暮らしの声</small></span></button><button className="icon-button" aria-label="絞り込み" onClick={()=>setFiltersOpen(true)}><SlidersHorizontal size={20}/></button></header>
    {!isSupabaseConfigured&&<div className="dev-banner"><AlertCircle size={15}/><span>デモ表示：Supabaseの環境変数が設定されていません</span></div>}
    {loadError&&<div className="data-state error"><AlertCircle/><span>情報を読み込めませんでした</span><button onClick={refresh}>再試行</button></div>}
    {loading&&<div className="data-state"><LoaderCircle className="spin"/><span>地域情報を読み込み中…</span></div>}
    <div className="search-area"><form className="searchbar" onSubmit={search}><Search size={19}/><input value={query} onChange={e=>{setQuery(e.target.value);setSearchError('')}} placeholder="住所・駅・施設を検索" aria-label="場所を検索"/><button disabled={searching} aria-label="検索する">{searching?<LoaderCircle className="spin" size={17}/>:<><span>検索</span><Search size={17}/></>}</button></form>{searchError&&<div className="search-message" role="status">{searchError}</div>}{searchResults.length>0&&<div className="search-results" role="listbox" aria-label="検索候補">{searchResults.map((result,index)=><button key={result.id} role="option" aria-selected={searchTarget?.id===result.id} onClick={()=>chooseSearchResult(result)}><MapPin size={17}/><span><b>{index===0?'最上位候補：':''}{result.name}</b><small>{result.displayName}</small></span></button>)}</div>}</div>
    <section className="map-wrap">
      <MapContainer center={[35.5148,137.8218]} zoom={13} zoomControl={false} attributionControl={true} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false} preferCanvas={true}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" updateWhenIdle={true} updateWhenZooming={false} updateInterval={300} keepBuffer={1} maxNativeZoom={19} maxZoom={19}/>
        <MapController locateToken={locateToken} searchTarget={searchTarget} onLocationFound={()=>showToast('現在地へ移動しました')} onLocationError={()=>showToast('現在地を取得できませんでした。地図や検索はそのまま利用できます')}/><MapClick onPick={p=>{setDraftPoint(p);setSelected(null);setSearchTarget(null);setSearchResults([])}}/>
        {visiblePlaces.map(p=><Marker key={p.id} position={[p.lat,p.lng]} icon={selected===p.id?activePinIcon:defaultPinIcon} eventHandlers={{click:()=>{trackEvent('pin_click',{place_id:p.id,category:placePosts(p.id)[0]?.category});setSelected(p.id);setDraftPoint(null)}}}/>) }
        {draftPoint&&<Marker position={[draftPoint.lat,draftPoint.lng]} icon={draftIcon}/>} 
        {searchTarget&&<Marker position={[searchTarget.lat,searchTarget.lng]} icon={searchIcon}/>}
      </MapContainer>
      <div className="map-tools"><button onClick={()=>setLocateToken(v=>v+1)} aria-label="現在地"><LocateFixed size={21}/></button><button onClick={()=>setFiltersOpen(true)} aria-label="フィルター"><Filter size={20}/><span>{activeCats.length}</span></button></div>
      <div className="map-hint">地図をタップして投稿場所を選べます</div>
      {draftPoint&&!selectedPlace&&<div className="draft-card"><div><b>この場所に情報を追加</b><small>{draftPoint.lat.toFixed(5)}, {draftPoint.lng.toFixed(5)}</small></div><button onClick={startPost}>ここに投稿</button></div>}
      {selectedPlace&&<PlaceCard place={selectedPlace} posts={placePosts(selectedPlace.id)} onClose={()=>setSelected(null)} onDetail={()=>setView('place')} onPost={startPost}/>}
    </section>
    <button className="post-fab" onClick={startPost}><Plus size={22}/>この場所に投稿する</button>
    <div className="map-credit">地図データ © OpenStreetMap</div>
    {filtersOpen&&<FilterSheet active={activeCats} setActive={setActiveCats} close={()=>setFiltersOpen(false)}/>} 
    {composer&&<Composer place={selectedPlace} point={draftPoint} nearby={draftPoint?places.map(place=>({place,distance:distanceMeters(draftPoint,place)})).filter(x=>x.distance<=80).sort((a,b)=>a.distance-b.distance):[]} onUseNearby={place=>{setSelected(place.id);setDraftPoint(null)}} close={()=>setComposer(false)} submit={submit}/>} 
    {toast&&<div className="toast"><Check size={17}/>{toast}</div>}
  </main>
}

function PlaceCard({place,posts,onClose,onDetail,onPost}:{place:Place;posts:Post[];onClose:()=>void;onDetail:()=>void;onPost:()=>void}){const latest=posts[0];return <aside className="place-card"><div className="drag-handle"/><button className="close" onClick={onClose}><X size={19}/></button><div className="place-kicker"><span>地点情報</span><small>{posts.length}件の投稿</small></div><h2>{place.name}</h2><p className="address"><MapPin size={15}/>{place.address}</p>{latest?<div className="latest"><div><span className="category-dot"/>{latest.category}<time>投稿日 {new Date(latest.createdAt).toLocaleDateString('ja-JP')}</time></div><p>{latest.body}</p><small className="occurred">発生時期：{periodLabel(latest)}</small></div>:<div className="empty">まだ投稿はありません</div>}<div className="card-actions"><button className="secondary" onClick={onPost}><Plus size={17}/>情報を追加</button><button className="primary" onClick={onDetail}>詳しく見る</button></div></aside>}

function FilterSheet({active,setActive,close}:{active:Category[];setActive:(v:Category[])=>void;close:()=>void}){return <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&close()}><section className="sheet filters"><header><div><small>表示する情報</small><h2>カテゴリーで絞り込む</h2></div><button onClick={close}><X/></button></header><div className="filter-list">{categories.map(c=>{const on=active.includes(c.name);return <button key={c.name} className={on?'on':''} onClick={()=>setActive(on?active.filter(x=>x!==c.name):[...active,c.name])}><span>{c.icon}</span>{c.name}<i>{on&&<Check size={15}/>}</i></button>})}</div><footer><button className="text-button" onClick={()=>setActive(categories.map(c=>c.name))}>すべて選択</button><button className="primary" onClick={close}>{active.length}カテゴリーを表示</button></footer></section></div>}

function Composer({place,point,nearby,onUseNearby,close,submit}:{place:Place|null;point:{lat:number;lng:number}|null;nearby:{place:Place;distance:number}[];onUseNearby:(place:Place)=>void;close:()=>void;submit:(d:{category:Category;body:string;occurredAt:string|null;occurredPeriod:OccurredPeriod;sourceType:SourceType;files:File[];placeName:string})=>Promise<void>}){
 const [step,setStep]=useState(1),[category,setCategory]=useState<Category|null>(null),[body,setBody]=useState(''),[occurredPeriod,setOccurredPeriod]=useState<OccurredPeriod>('recent'),[occurredDate,setOccurredDate]=useState(''),[sourceType,setSourceType]=useState<SourceType|null>(null),[files,setFiles]=useState<File[]>([]),[placeName,setPlaceName]=useState(''),[accepted,setAccepted]=useState(false),[warning,setWarning]=useState(''),[submitting,setSubmitting]=useState(false),[submitError,setSubmitError]=useState('')
 const check=()=>{const rules=[[/([0-9]{1,4})号室/,'部屋番号が含まれている可能性があります'],[/0[0-9]{1,4}-[0-9]{1,4}-[0-9]{3,4}/,'電話番号が含まれている可能性があります'],[/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,'メールアドレスが含まれています'],[/(犯罪者|詐欺師|死ね|殺す)/,'個人攻撃や断定的な表現が含まれる可能性があります']] as const;const hit=rules.find(([r])=>r.test(body));setWarning(hit?.[1]||'');return !hit}
 const canNext=step===1?Boolean(place||point):step===2?Boolean(category):step===3?body.trim().length>=15:step===4?Boolean(occurredPeriod&&sourceType&&(occurredPeriod!=='date'||occurredDate)):true
 return <div className="overlay composer-overlay"><section className="composer"><header><button onClick={()=>step>1?setStep(step-1):close()}>{step>1?<ChevronLeft/>:<X/>}</button><div><small>投稿する</small><b>ステップ {step} / 6</b></div><span className="step-pill">{Math.round(step/6*100)}%</span></header><div className="progress"><i style={{width:`${step/6*100}%`}}/></div><div className="composer-body">
 {step===1&&<><p className="eyebrow">STEP 1 — 場所</p><h2>この場所で合っていますか？</h2><div className="location-confirm"><MapPin/><div><b>{place?.name||'地図上で選択した地点'}</b><small>{place?.address||`${point?.lat.toFixed(5)}, ${point?.lng.toFixed(5)}`}</small></div><Check/></div>{!place&&nearby.length>0&&<div className="nearby"><b>近くに登録済みの地点があります</b><small>同じ場所なら、既存地点へ投稿をまとめてください。</small>{nearby.map(item=><button key={item.place.id} onClick={()=>onUseNearby(item.place)}><span>{item.place.name}</span><i>約{Math.round(item.distance)}m・ここを選ぶ</i></button>)}</div>}{!place&&<label className="field">場所の名前（任意）<input value={placeName} onChange={e=>setPlaceName(e.target.value)} placeholder="例：○○公園周辺"/></label>}<p className="microcopy">位置が違う場合は一度閉じて、地図上の正しい場所をタップしてください。</p></>}
 {step===2&&<><p className="eyebrow">STEP 2 — カテゴリー</p><h2>どんな情報ですか？</h2><div className="category-grid">{categories.map(c=><button className={category===c.name?'selected':''} onClick={()=>setCategory(c.name)} key={c.name}><span>{c.icon}</span>{c.name}{category===c.name&&<i><Check size={13}/></i>}</button>)}</div></>}
 {step===3&&<><p className="eyebrow">STEP 3 — 内容</p><h2>この場所について、<br/>何がありましたか？</h2><label className="textarea"><textarea value={body} onChange={e=>{setBody(e.target.value);setWarning('')}} onBlur={check} maxLength={500} placeholder="見たこと・感じたことを、事実と感想に分けて書いてください。"/><span>{body.length} / 500</span></label>{warning&&<div className="warning"><ShieldCheck/>{warning}<small>個人ではなく、場所の状況に焦点を当てた表現に直してください。</small></div>}<div className="writing-tip"><ShieldCheck/><p><b>安心して共有するために</b>個人名・部屋番号・連絡先は書かず、確認できた状況を具体的に書いてください。</p></div></>}
 {step===4&&<><p className="eyebrow">STEP 4 — 時期と情報源</p><h2>いつ、どのように<br/>知った情報ですか？</h2><h3 className="form-subtitle">出来事が起きた時期</h3><div className="choice-list compact">{periodOptions.map(x=><button className={occurredPeriod===x.value?'selected':''} onClick={()=>setOccurredPeriod(x.value)} key={x.value}>{x.label}<i>{occurredPeriod===x.value&&<Check/>}</i></button>)}</div>{occurredPeriod==='date'&&<label className="field">発生日<input type="date" value={occurredDate} max={new Date().toISOString().slice(0,10)} onChange={e=>setOccurredDate(e.target.value)}/></label>}<h3 className="form-subtitle source-title">この情報をどのように知りましたか？</h3><div className="source-grid">{sourceOptions.map(x=><button className={sourceType===x.value?'selected':''} onClick={()=>setSourceType(x.value)} key={x.value}>{x.label}{sourceType===x.value&&<Check size={15}/>}</button>)}</div></>}
 {step===5&&<><p className="eyebrow">STEP 5 — 写真（任意）</p><h2>今回は写真なしで進みます</h2><div className="upload upload-disabled"><ShieldCheck/><b>Storageは準備済みです</b><small>写真の永続アップロードは次工程で接続します</small></div><p className="microcopy">DBへの投稿共有を安定させるため、この工程では写真を送信しません。</p></>}
 {step===6&&<><p className="eyebrow">STEP 6 — 確認</p><h2>この内容で投稿しますか？</h2><div className="review-box"><small>{place?.name||placeName||'選択した地点'} ・ {category}</small><p>{body}</p><span>発生時期：{occurredPeriod==='date'&&occurredDate?`${new Date(`${occurredDate}T00:00:00`).toLocaleDateString('ja-JP')}頃`:periodOptions.find(x=>x.value===occurredPeriod)?.label}</span><span>情報源：{sourceOptions.find(x=>x.value===sourceType)?.label} ・ 写真{files.length}枚</span><span>投稿日：投稿完了時に自動記録</span></div><label className="consent"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span><b>投稿前の最終確認</b>個人を特定する情報や誹謗中傷を含まず、自分が確認した情報であることを確認しました。</span></label>{submitError&&<div className="submit-error"><AlertCircle/>投稿できませんでした。通信状況を確認してもう一度お試しください。</div>}</>}
 </div><footer>{step<6?<button className="primary wide" disabled={!canNext} onClick={()=>{if(step===3&&!check())return;setStep(step+1)}}>次へ進む</button>:<button className="primary wide" disabled={!accepted||Boolean(warning)||submitting} onClick={async()=>{if(!category||!sourceType)return;setSubmitting(true);setSubmitError('');try{await submit({category,body,occurredAt:occurredPeriod==='date'?occurredDate:null,occurredPeriod,sourceType,files,placeName})}catch(error){console.error('Post submission failed',error);setSubmitError('failed');setSubmitting(false)}}}>{submitting?<><LoaderCircle className="spin"/>投稿しています…</>:'投稿する'}</button>}</footer></section></div>
}

function PlaceDetail({place,posts,onBack,onPost,onReport,toast}:{place:Place;posts:Post[];onBack:()=>void;onPost:()=>void;onReport:(id:string)=>void;toast:string}){return <main className="detail-page"><header><button onClick={onBack}><ChevronLeft/></button><span>地点の情報</span><button><Search/></button></header><section className="detail-hero"><div className="mini-map"><MapPin/></div><p className="eyebrow">地域のみなさんからの情報</p><h1>{place.name}</h1><p className="address"><MapPin size={15}/>{place.address}</p><div className="stats"><div><b>{posts.length}</b><span>投稿</span></div><div><b>{new Set(posts.map(p=>p.sourceType)).size}</b><span>情報源の種類</span></div><div><b>{posts.reduce((n,p)=>n+p.helpful,0)}</b><span>参考になった</span></div></div></section><section className="detail-content"><div className="section-title"><div><small>みんなの声</small><h2>この場所の投稿</h2></div><button onClick={onPost}><Plus/>情報を追加</button></div>{posts.map(p=><article className="post-card" key={p.id}><header><span>{p.category}</span><time>投稿日：{new Date(p.createdAt).toLocaleDateString('ja-JP')}</time></header><p>{p.body}</p><div className="event-time">発生時期：{periodLabel(p)}</div><div className="post-meta"><span><ShieldCheck/> {p.verification.join('・')}</span><button onClick={()=>onReport(p.id)}><Flag/>通報</button></div></article>)}{!posts.length&&<div className="detail-empty"><MapPin/><b>まだ情報がありません</b><p>この場所について知っていることを、最初に共有しませんか？</p></div>}</section><button className="post-fab detail-fab" onClick={onPost}><Plus/>この場所に投稿する</button>{toast&&<div className="toast"><Check/>{toast}</div>}</main>}
