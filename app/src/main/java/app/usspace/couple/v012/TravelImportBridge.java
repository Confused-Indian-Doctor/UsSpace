package app.usspace.couple.v012;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.util.Base64;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.concurrent.Executors;

/** ACTION_SEND review inbox. Content is copied locally; never saved/shared automatically. */
public final class TravelImportBridge {
    private final Activity activity; private final WebView view; private final SharedPreferences prefs;
    private final java.util.concurrent.ExecutorService executor=Executors.newSingleThreadExecutor();
    private final FirebaseAuth auth=FirebaseAuth.getInstance();private final FirebaseAuth.AuthStateListener listener;
    private boolean pageReady,closed;private String error="";
    private static final int MAX_BYTES=12*1024*1024;
    private final java.util.concurrent.atomic.AtomicInteger pendingReads=new java.util.concurrent.atomic.AtomicInteger();
    public TravelImportBridge(Activity activity,WebView view){this.activity=activity;this.view=view;prefs=activity.getSharedPreferences("usspace.travel.imports.v1",0);
      listener=a->activity.runOnUiThread(this::post);auth.addAuthStateListener(listener);}
    private String uid(){FirebaseUser user=auth.getCurrentUser();return user==null?"":user.getUid();}
    private JSONArray jobs(){try{return new JSONArray(prefs.getString("jobs","[]"));}catch(Exception e){return new JSONArray();}}
    private void save(JSONArray jobs){prefs.edit().putString("jobs",jobs.toString()).commit();}
    private static String digest(byte[] data)throws Exception{byte[] hash=MessageDigest.getInstance("SHA-256").digest(data);StringBuilder out=new StringBuilder();for(byte b:hash)out.append(String.format("%02x",b&255));return out.toString();}
    public void handleIntent(Intent intent){if(intent==null||!Intent.ACTION_SEND.equals(intent.getAction())||closed)return;
      final String mime=intent.getType();if(mime==null){failure("The shared content needs a text or image type. You can paste a caption instead.");return;}
      if(mime.startsWith("text/")){try{CharSequence raw=intent.getCharSequenceExtra(Intent.EXTRA_TEXT);String text=raw==null?"":raw.toString();if(text.trim().isEmpty()||text.length()>12000){failure("Share up to 12,000 characters, or paste a shorter caption.");return;}JSONObject job=new JSONObject();job.put("ownerUid",uid());job.put("text",text);job.put("mime","text/plain");job.put("ocrStatus","not-needed");enqueue(job,digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){failure("That shared text could not be opened. Paste the link instead.");}return;}
      if(!mime.startsWith("image/")){failure("Share a JPEG, PNG or WebP screenshot, a link or a caption.");return;}
      final Uri uri;try{Uri stream=Build.VERSION.SDK_INT>=33?intent.getParcelableExtra(Intent.EXTRA_STREAM,Uri.class):intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if(stream==null&&intent.getClipData()!=null&&intent.getClipData().getItemCount()==1)stream=intent.getClipData().getItemAt(0).getUri();uri=stream;
      }catch(RuntimeException invalid){failure("That attachment could not be opened.");return;}
      if(uri==null||!"content".equals(uri.getScheme())){failure("Choose an image from your phone's share menu.");return;}
      if(jobs().length()>=10){failure("Review or discard an earlier import before sharing more images.");return;}
      if(pendingReads.incrementAndGet()>3){pendingReads.decrementAndGet();failure("Finish reviewing an image before sharing another.");return;}final String ownerAtReceive=uid();executor.execute(()->{try{readImage(uri,ownerAtReceive);}finally{pendingReads.decrementAndGet();}});
    }
    private void readImage(Uri uri,String ownerAtReceive){Bitmap bitmap=null;try{
      String actual=activity.getContentResolver().getType(uri);if(actual==null||!java.util.Arrays.asList("image/jpeg","image/png","image/webp").contains(actual))throw new IllegalArgumentException();
      ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream input=activity.getContentResolver().openInputStream(uri)){if(input==null)throw new IllegalArgumentException();byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1){if(bytes.size()+count>MAX_BYTES)throw new IllegalArgumentException();bytes.write(buffer,0,count);}}
      byte[] source=bytes.toByteArray();boolean jpeg=source.length>3&&(source[0]&255)==255&&(source[1]&255)==216&&(source[2]&255)==255;
      boolean png=source.length>8&&source[0]==(byte)137&&source[1]==80&&source[2]==78&&source[3]==71;
      boolean webp=source.length>12&&source[0]==82&&source[1]==73&&source[2]==70&&source[3]==70&&source[8]==87&&source[9]==69&&source[10]==66&&source[11]==80;
      if(!(actual.equals("image/jpeg")&&jpeg||actual.equals("image/png")&&png||actual.equals("image/webp")&&webp))throw new IllegalArgumentException();
      BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(source,0,source.length,options);
      if(options.outWidth<1||options.outHeight<1||(long)options.outWidth*options.outHeight>40_000_000)throw new IllegalArgumentException();int sample=1;while(Math.max(options.outWidth,options.outHeight)/sample>2048)sample*=2;options.inJustDecodeBounds=false;options.inSampleSize=sample;
      bitmap=BitmapFactory.decodeByteArray(source,0,source.length,options);if(bitmap==null)throw new IllegalArgumentException();
      final Bitmap recognized=bitmap;final JSONObject job=new JSONObject();job.put("ownerUid",ownerAtReceive);job.put("mime",actual);job.put("text","");job.put("ocrStatus","reading");job.put("image",thumbnail(bitmap));final String fingerprint=digest(source);
      activity.runOnUiThread(()->{String jobId=enqueue(job,fingerprint);if(jobId.isEmpty()){recognized.recycle();return;}
        try { com.google.mlkit.vision.text.TextRecognizer reader=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        reader.process(InputImage.fromBitmap(recognized,0)).addOnSuccessListener(result->{String text=result.getText();updateText(jobId,text.length()>12000?text.substring(0,12000):text,text.length()>12000?"partial":"review");})
          .addOnFailureListener(f->updateText(jobId,"","unavailable")).addOnCompleteListener(done->{reader.close();recognized.recycle();});
        } catch(RuntimeException unavailable) { recognized.recycle();updateText(jobId,"","unavailable"); }
      });bitmap=null;
    }catch(Exception invalid){failure("Choose a JPEG, PNG or WebP image under 12 MB. The image could not be read; you can paste a caption or add a place manually.");}finally{if(bitmap!=null)bitmap.recycle();}}
    @JavascriptInterface public void recognizeImage(String data){
      if(closed||data==null||data.length()>140000||!data.matches("data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}")){failure("Choose a JPEG screenshot again.");return;}
      final String owner=uid();executor.execute(()->{Bitmap image=null;try{byte[] bytes=Base64.decode(data.substring(data.indexOf(',')+1),Base64.DEFAULT);BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);if(bounds.outWidth<1||bounds.outHeight<1||(long)bounds.outWidth*bounds.outHeight>4_000_000)throw new IllegalArgumentException();image=BitmapFactory.decodeByteArray(bytes,0,bytes.length);if(image==null)throw new IllegalArgumentException();final Bitmap bitmap=image;final JSONObject job=new JSONObject();job.put("ownerUid",owner);job.put("mime","image/jpeg");job.put("image",data);job.put("text","");job.put("ocrStatus","reading");String fingerprint=digest(bytes);activity.runOnUiThread(()->{String id=enqueue(job,fingerprint);if(id.isEmpty()){bitmap.recycle();return;}try{com.google.mlkit.vision.text.TextRecognizer reader=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);reader.process(InputImage.fromBitmap(bitmap,0)).addOnSuccessListener(result->{String text=result.getText();updateText(id,text.substring(0,Math.min(12000,text.length())),text.length()>12000?"partial":"review");}).addOnFailureListener(f->updateText(id,"","unavailable")).addOnCompleteListener(done->{reader.close();bitmap.recycle();});}catch(RuntimeException unavailable){bitmap.recycle();updateText(id,"","unavailable");}});image=null;}catch(Exception invalid){failure("The screenshot could not be read. Keep the image and add a caption instead.");}finally{if(image!=null)image.recycle();}});
    }
    private static String thumbnail(Bitmap source)throws Exception{double scale=Math.min(1,1000.0/Math.max(source.getWidth(),source.getHeight()));Bitmap small=Bitmap.createScaledBitmap(source,Math.max(1,(int)(source.getWidth()*scale)),Math.max(1,(int)(source.getHeight()*scale)),true);String result="";for(int quality:new int[]{80,65,50,35}){ByteArrayOutputStream bytes=new ByteArrayOutputStream();small.compress(Bitmap.CompressFormat.JPEG,quality,bytes);result="data:image/jpeg;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP);if(result.length()<=140000)break;}if(small!=source)small.recycle();if(result.length()>140000)throw new IllegalArgumentException();return result;}
    private String enqueue(JSONObject job,String fingerprint){if(android.os.Looper.myLooper()!=android.os.Looper.getMainLooper()){activity.runOnUiThread(()->enqueue(job,fingerprint));return "";}if(closed)return "";try{JSONArray list=jobs();for(int i=0;i<list.length();i++)if(fingerprint.equals(list.getJSONObject(i).optString("fingerprint"))){post();return "";}
      if(System.currentTimeMillis()-prefs.getLong("seen:"+fingerprint,0)<300000){post();return "";}if(list.length()>=10){failure("Review an earlier import before sharing more.");return "";}
      String id="import_"+java.util.UUID.randomUUID();job.put("id",id);job.put("fingerprint",fingerprint);if(!job.has("ownerUid"))job.put("ownerUid",uid());job.put("createdAt",Instant.now().toString());list.put(job);save(list);error="";post();return id;
    }catch(Exception invalid){failure("The import could not be kept on this phone. Try pasting its link.");return "";}}
    private void updateText(String id,String text,String status){if(closed)return;try{JSONArray list=jobs();for(int i=0;i<list.length();i++){JSONObject job=list.getJSONObject(i);if(id.equals(job.optString("id"))){job.put("text",text);job.put("ocrStatus",status);}}save(list);post();}catch(Exception ignored){}}
    @JavascriptInterface public void refresh(){activity.runOnUiThread(this::post);}
    @JavascriptInterface public String image(String id){try{JSONArray list=jobs();for(int i=0;i<list.length();i++){JSONObject job=list.getJSONObject(i);if(id.equals(job.optString("id"))&&(job.optString("ownerUid").isEmpty()||uid().equals(job.optString("ownerUid"))))return job.optString("image");}}catch(Exception ignored){}return "";}
    @JavascriptInterface public void claim(String id){activity.runOnUiThread(()->{if(uid().isEmpty())return;try{JSONArray list=jobs();for(int i=0;i<list.length();i++){JSONObject job=list.getJSONObject(i);if(id.equals(job.optString("id"))&&job.optString("ownerUid").isEmpty())job.put("ownerUid",uid());}save(list);post();}catch(Exception ignored){}});}
    @JavascriptInterface public void acknowledge(String id){activity.runOnUiThread(()->{try{JSONArray list=jobs(),keep=new JSONArray();for(int i=0;i<list.length();i++){JSONObject job=list.getJSONObject(i);boolean own=job.optString("ownerUid").isEmpty()||uid().equals(job.optString("ownerUid"));if(id.equals(job.optString("id"))&&own)prefs.edit().putLong("seen:"+job.optString("fingerprint"),System.currentTimeMillis()).apply();else keep.put(job);}save(keep);post();}catch(Exception ignored){}});}
    public void onPageReady(){pageReady=true;post();}
    private void failure(String message){activity.runOnUiThread(()->{if(!closed){error=message;post();}});}
    private void post(){if(closed||!pageReady)return;try{JSONArray list=jobs(),visible=new JSONArray();for(int i=0;i<list.length();i++){JSONObject job=list.getJSONObject(i);if(!job.optString("ownerUid").isEmpty()&&!uid().equals(job.optString("ownerUid")))continue;JSONObject copy=new JSONObject(job.toString());copy.remove("image");copy.remove("fingerprint");copy.put("hasImage",job.has("image"));visible.put(copy);}JSONObject data=new JSONObject();data.put("jobs",visible);data.put("error",error);view.evaluateJavascript("window.onUsTravelImports&&window.onUsTravelImports("+data+");",null);}catch(Exception ignored){}}
    public void close(){closed=true;auth.removeAuthStateListener(listener);executor.shutdownNow();}
}
