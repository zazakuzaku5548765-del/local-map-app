const maxInputBytes=15*1024*1024
const maxDimension=1600

export function validateImageFiles(files:File[]){
  if(files.length>3)throw new Error('写真は3枚まで選択できます')
  for(const file of files){
    if(!file.type.startsWith('image/'))throw new Error('画像ファイルを選択してください')
    if(file.size>maxInputBytes)throw new Error('1枚15MB以下の写真を選択してください')
  }
}

const loadImage=(file:File)=>new Promise<HTMLImageElement>((resolve,reject)=>{
  const url=URL.createObjectURL(file),image=new Image()
  image.onload=()=>{URL.revokeObjectURL(url);resolve(image)}
  image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('写真を読み込めませんでした'))}
  image.src=url
})

export async function compressImage(file:File){
  const image=await loadImage(file)
  const scale=Math.min(1,maxDimension/Math.max(image.naturalWidth,image.naturalHeight))
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale))
  const context=canvas.getContext('2d')
  if(!context)throw new Error('写真を処理できませんでした')
  context.drawImage(image,0,0,canvas.width,canvas.height)
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',.82))
  if(!blob)throw new Error('写真を圧縮できませんでした')
  return blob
}
