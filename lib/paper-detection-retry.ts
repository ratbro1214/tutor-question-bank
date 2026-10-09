export function isDetectionNetworkError(error:unknown) {
 return error instanceof Error && (error instanceof TypeError || /network|connection.*(?:lost|reset|closed)|socket|fetch failed/i.test(error.message));
}
export async function retryDetectionNetwork<T>(operation:()=>Promise<T>,signal:AbortSignal,delayMs=500):Promise<T> {
 for(let attempt=0;;attempt++) {
  signal.throwIfAborted();
  try { return await operation(); }
  catch(error) {
   if(signal.aborted||attempt>=2||!isDetectionNetworkError(error))throw error;
   await new Promise<void>((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},delayMs);
    signal.addEventListener('abort',abort,{once:true});
   });
  }
 }
}
