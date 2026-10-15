package app.usspace.couple.v012;

import android.app.Activity;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.util.Set;
import org.json.JSONObject;

/** Foreground-only, offline TTS for the visible travel transcript. No voice impersonation. */
public final class TravelAudioBridge {
    private final Activity activity;
    private final WebView web;
    private TextToSpeech speech;
    private volatile boolean ready,closed;
    private String text="",utterance="";
    private int offset,lastStart;
    private long generation;
    public TravelAudioBridge(Activity activity,WebView web){
        this.activity=activity;this.web=web;
        speech=new TextToSpeech(activity,status->{ready=status==TextToSpeech.SUCCESS;});
        speech.setOnUtteranceProgressListener(new UtteranceProgressListener(){
            @Override public void onStart(String id){activity.runOnUiThread(()->{if(id.equals(utterance))emit("playing","");});}
            @Override public void onDone(String id){activity.runOnUiThread(()->{if(id.equals(utterance)){utterance="";offset=0;lastStart=0;emit("finished","");}});}
            @Override public void onError(String id){activity.runOnUiThread(()->{if(id.equals(utterance)){utterance="";emit("unavailable","This voice could not play. Your transcript is still available.");}});}
            @Override public void onRangeStart(String id,int start,int end,int frame){activity.runOnUiThread(()->{if(id.equals(utterance))lastStart=offset+start;});}
        });
    }
    @JavascriptInterface public void play(String transcript){
        if(transcript==null||transcript.trim().isEmpty()||transcript.length()>3500)return;
        activity.runOnUiThread(()->{if(closed)return;stopInternal();text=transcript;offset=0;lastStart=0;speak();});
    }
    private void speak(){
        if(closed||!ready||speech==null){emit("unavailable","The Android voice is starting. Try again shortly.");return;}
        Voice selected=null;Set<Voice> voices=speech.getVoices();
        if(voices!=null)for(Voice v:voices)if(!v.isNetworkConnectionRequired()&&"en".equals(v.getLocale().getLanguage()))if(selected==null||v.getQuality()>selected.getQuality())selected=v;
        if(selected==null){emit("unavailable","Download an offline English voice in Android text-to-speech settings. The written transcript stays available.");return;}
        speech.setVoice(selected);speech.setSpeechRate(.9f);utterance="usspace-travel-"+(++generation);
        if(speech.speak(text.substring(Math.min(offset,text.length())),TextToSpeech.QUEUE_FLUSH,new Bundle(),utterance)==TextToSpeech.ERROR){utterance="";emit("unavailable","Audio could not start. Read the transcript below.");}
    }
    @JavascriptInterface public void pause(){activity.runOnUiThread(()->{if(closed||utterance.isEmpty())return;offset=lastStart;utterance="";speech.stop();emit("paused","Resume may repeat the current sentence.");});}
    @JavascriptInterface public void resume(){activity.runOnUiThread(()->{if(!closed&&!text.isEmpty()&&utterance.isEmpty())speak();});}
    @JavascriptInterface public void stop(){activity.runOnUiThread(()->{stopInternal();emit("stopped","");});}
    private void stopInternal(){utterance="";text="";offset=0;lastStart=0;if(speech!=null)speech.stop();}
    private void emit(String state,String message){if(!closed)web.evaluateJavascript("window.onUsTravelAudio&&window.onUsTravelAudio({state:"+JSONObject.quote(state)+",message:"+JSONObject.quote(message)+"});",null);}
    public void close(){closed=true;ready=false;stopInternal();if(speech!=null){speech.shutdown();speech=null;}}
}
