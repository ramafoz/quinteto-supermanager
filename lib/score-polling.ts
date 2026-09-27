export function pollScores(run:()=>void,onEnd:()=>void,endsAt:number){
 let stopped=false;
 const stop=()=>{stopped=true;clearInterval(interval);clearTimeout(end);};
 const interval=setInterval(()=>{if(stopped)return;if(Date.now()>=endsAt){stop();onEnd();}else run();},120000);
 const end=setTimeout(()=>{if(!stopped){stop();onEnd();}},Math.max(0,Math.min(endsAt-Date.now(),2147483647)));
 return stop;
}
