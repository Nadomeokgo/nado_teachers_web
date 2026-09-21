/** Short pronunciation clips only. No upload/storage here; always closes mic tracks. */
export function encodeWav(samples, sampleRate=16000) {
  const buffer=new ArrayBuffer(44+samples.length*2),v=new DataView(buffer);
  const str=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,36+samples.length*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,Number.isFinite(samples[i])?samples[i]:0));v.setInt16(44+i*2,s<0?s*32768:s*32767,true);}
  return new Blob([buffer],{type:'audio/wav'});
}
export class PracticeRecorder {
  constructor({onTick=()=>{},onReady=()=>{},onError=()=>{}}={}){this.onTick=onTick;this.onComplete=onReady;this.onError=onError;this.recorder=null;this.stream=null;this.context=null;this.timer=null;this.active=false;this.cancelled=false;}
  async start(){
    if(this.active)throw new Error('이미 녹음 중입니다.');
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('HTTPS 또는 localhost에서 지원되는 브라우저로 열어주세요.');
    this.cancelled=false;this.active=true;
    try{
      const Context=window.AudioContext||window.webkitAudioContext;
      this.context=new Context();await this.context.resume();
      this.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
      if(this.cancelled){this.release();return;}
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const rec=new MediaRecorder(this.stream,mime?{mimeType:mime}:{});this.recorder=rec;const chunks=[];
      rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      rec.onerror=()=>{this.release();this.onError(new Error('녹음 중 오류가 발생했습니다. 다시 시도해주세요.'));};
      rec.onstop=async()=>{
        clearInterval(this.timer);this.stream?.getTracks().forEach(t=>t.stop());
        try{
          if(this.cancelled)return;
          const data=await this.context.decodeAudioData(await new Blob(chunks,{type:rec.mimeType}).arrayBuffer());
          if(data.duration<1)throw new Error('1초 이상 녹음해주세요.');
          const length=Math.min(Math.floor(data.duration*16000),30*16000);
          const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
          const offline=new Offline(1,length,16000),source=offline.createBufferSource();source.buffer=data;source.connect(offline.destination);source.start();
          const rendered=await offline.startRendering();
          this.onComplete(encodeWav(rendered.getChannelData(0)),length/16000);
        }catch(error){if(!this.cancelled)this.onError(error);}finally{this.release();}
      };
      const started=performance.now();rec.start(250);this.onTick(0);
      this.timer=setInterval(()=>{const seconds=(performance.now()-started)/1000;this.onTick(Math.min(seconds,20));if(seconds>=20)this.stop();},200);
    }catch(error){this.release();throw error;}
  }
  stop(){clearInterval(this.timer);if(this.recorder?.state==='recording')this.recorder.stop();}
  cancel(){this.cancelled=true;this.stop();this.release();}
  release(){clearInterval(this.timer);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.active=false;const c=this.context;this.context=null;if(c&&c.state!=='closed')c.close().catch(()=>{});}
}
