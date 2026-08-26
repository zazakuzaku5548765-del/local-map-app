type AnalyticsEvents={
  search:{search_term:string}
  pin_click:{place_id:string;category?:string}
  post_start:{place_id?:string}
  post_complete:{place_id:string;categories:string;source_type:string}
  report_submit:{post_id:string;reason:string}
}

declare global{interface Window{gtag?:(command:'event',eventName:string,parameters?:Record<string,string>)=>void}}

export function trackEvent<Name extends keyof AnalyticsEvents>(name:Name,parameters:AnalyticsEvents[Name]){
  if(typeof window==='undefined'||typeof window.gtag!=='function')return
  window.gtag('event',name,parameters)
}

export function privacySafeSearchTerm(value:string){
  const term=value.trim().replace(/\s+/g,' ').slice(0,80)
  const looksSensitive=/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|0\d{1,4}[-ー]\d{1,4}[-ー]\d{3,4}|〒?\d{3}[-ー]\d{4}|\d+\s*(丁目|番地|番|号)/
  return looksSensitive.test(term)?'redacted':term
}
