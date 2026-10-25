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
    private boolean pageReady;private volatile boolean closed;private String error="";
    private static final int MAX_BYTES=TravelImportPolicy.MAX_IMAGE_BYTES;
    private final java.util.Set<String> activeOcr=java.util.concurrent.ConcurrentHashMap.newKeySet();
    private final java.util.concurrent.atomic.AtomicInteger pendingReads=new java.util.concurrent.atomic.AtomicInteger();
    public TravelImportBridge(Activity activity,WebView view){this.activity=activity;this.view=view;prefs=activity.getSharedPreferences("usspace.travel.imports.v1",0);
      listener=a->activity.runOnUiThread(()->{post();resumePending();});auth.addAuthStateListener(listener);executor.execute(()->{java.io.File dir=new java.io.File(activity.getFilesDir(),"travel-import-media");java.io.File[] files=dir.listFiles();if(files!=null)for(java.io.File file:files)if(System.currentTimeMillis()-file.lastModified()>3600000)file.delete();});}
    private String uid(){FirebaseUser user=auth.getCurrentUser();return user==null?"":user.getUid();}
    private JSONArray jobs(){try{return new JSONArray(prefs.getString("jobs","[]"));}catch(Exception e){return new JSONArray();}}
    private void save(JSONArray jobs){prefs.edit().putString("jobs",jobs.toString()).commit();}
    private static String digest(byte[] data)throws Exception{byte[] hash=MessageDigest.getInstance("SHA-256").digest(data);StringBuilder out=new StringBuilder();for(byte b:hash)out.append(String.format("%02x",b&255));return out.toString();}
    public void handleIntent(Intent intent){if(intent==null||!Intent.ACTION_SEND.equals(intent.getAction())||closed)return;
      final String mime=intent.getType();if(mime==null){failure("The shared content needs a text or image type. You can paste a caption instead.");return;}
      if(mime.startsWith("text/")){try{CharSequence raw=intent.getCharSequenceExtra(Intent.EXTRA_TEXT);String text=raw==null?"":raw.toString();if(!TravelImportPolicy.text(text)){failure("Share up to 12,000 characters, or paste a shorter caption.");return;}JSONObject job=new JSONObject();job.put("ownerUid",uid());job.put("text",text);job.put("mime","text/plain");job.put("ocrStatus","not-needed");enqueue(job,digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){failure("That shared text could not be opened. Paste the link instead.");}return;}
      if(!mime.startsWith("image/")&&!"video/mp4".equals(mime)){failure("Share a JPEG, PNG or WebP screenshot, a link or a caption.");return;}
      final Uri uri;try{Uri stream=Build.VERSION.SDK_INT>=33?intent.getParcelableExtra(Intent.EXTRA_STREAM,Uri.class):intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if(stream==null&&intent.getClipData()!=null&&intent.getClipData().getItemCount()==1)stream=intent.getClipData().getItemAt(0).getUri();uri=stream;
      }catch(RuntimeException invalid){failure("That attachment could not be opened.");return;}
      if(uri==null||!"content".equals(uri.getScheme())){failure("Choose an image from your phone's share menu.");return;}
      if(jobs().length()>=TravelImportPolicy.MAX_JOBS){failure("Review or discard an earlier import before sharing more images.");return;}
      if(pendingReads.incrementAndGet()>3){pendingReads.decrementAndGet();failure("Finish reviewing an image before sharing another.");return;}final String ownerAtReceive=uid();final String caption=shareCaption(intent);executor.execute(()->{try{if("video/mp4".equals(mime))readVideo(uri,ownerAtReceive,caption);else readImage(uri,ownerAtReceive,caption);}finally{pendingReads.decrementAndGet();}});
    }
    private static String shareCaption(Intent intent){try{CharSequence value=intent.getCharSequenceExtra(Intent.EXTRA_TEXT);return value!=null&&TravelImportPolicy.text(value.toString())?value.toString():"";}catch(RuntimeException invalid){return "";}}
    /** User-provided local MP4 only. Never fetches a social video or uploads media. */
    private void readVideo(Uri uri,String owner,String caption){java.io.File file=null;try{
      if(!"video/mp4".equals(activity.getContentResolver().getType(uri)))throw new IllegalArgumentException();
      java.io.File directory=new java.io.File(activity.getFilesDir(),"travel-import-media");if(!directory.exists()&&!directory.mkdirs())throw new IllegalArgumentException();
      file=java.io.File.createTempFile("video_",".mp4",directory);java.security.MessageDigest hash=MessageDigest.getInstance("SHA-256");int size=0;
      byte[] header=new byte[12];int headerSize=0;
      try(InputStream input=activity.getContentResolver().openInputStream(uri);java.io.FileOutputStream output=new java.io.FileOutputStream(file)){if(input==null)throw new IllegalArgumentException();byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1){size+=n;if(size>TravelImportPolicy.MAX_VIDEO_BYTES||closed||Thread.currentThread().isInterrupted())throw new IllegalArgumentException();if(headerSize<12){int take=Math.min(n,12-headerSize);System.arraycopy(buffer,0,header,headerSize,take);headerSize+=take;}hash.update(buffer,0,n);output.write(buffer,0,n);}}
      if(!TravelImportPolicy.videoHeader(header))throw new IllegalArgumentException();StringBuilder fingerprint=new StringBuilder();for(byte b:hash.digest())fingerprint.append(String.format("%02x",b&255));
      final java.io.File ready=file;JSONObject job=new JSONObject();job.put("ownerUid",owner);job.put("mime","video/mp4");job.put("sharedText",caption);job.put("text",caption);job.put("ocrStatus","reading");job.put("videoFile",file.getName());job.put("mediaStatus","On-device sampled video text; audio not transcribed. No upload.");
      activity.runOnUiThread(()->{String id=enqueue(job,fingerprint.toString());if(id.isEmpty())ready.delete();else resumePending();});file=null;
    }catch(Exception invalid){failure("Choose a local MP4 under 20 MB and 2 minutes, up to 1080p. Permission or format may be unsupported. Paste a caption or share screenshots instead.");}finally{if(file!=null)file.delete();}}
    private java.io.File videoFile(JSONObject job){String name=job.optString("videoFile");if(!name.matches("video_[A-Za-z0-9_-]+\\.mp4"))return null;return new java.io.File(new java.io.File(activity.getFilesDir(),"travel-import-media"),name);}
    private boolean hasJob(String id){JSONArray list=jobs();for(int i=0;i<list.length();i++)if(id.equals(list.optJSONObject(i).optString("id")))return true;return false;}
    private void videoText(String id,java.io.File file){android.media.MediaMetadataRetriever media=new android.media.MediaMetadataRetriever();com.google.mlkit.vision.text.TextRecognizer reader=null;String status="unavailable",text="";try{
      if(file==null||!file.isFile()||file.length()>TravelImportPolicy.MAX_VIDEO_BYTES||System.currentTimeMillis()-file.lastModified()>3600000)throw new IllegalArgumentException();
      media.setDataSource(file.getAbsolutePath());int width=Integer.parseInt(media.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)),height=Integer.parseInt(media.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));long duration=Long.parseLong(media.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION));if(!TravelImportPolicy.videoBounds(width,height,duration))throw new IllegalArgumentException();
      reader=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);long deadline=android.os.SystemClock.elapsedRealtime()+45000;java.util.LinkedHashSet<String> excerpts=new java.util.LinkedHashSet<>();
      for(int i=0;i<TravelImportPolicy.MAX_VIDEO_FRAMES;i++){if(closed||Thread.currentThread().isInterrupted()||!hasJob(id))return;if(android.os.SystemClock.elapsedRealtime()>deadline)break;
        Bitmap frame=media.getFrameAtTime((duration*1000L*i)/TravelImportPolicy.MAX_VIDEO_FRAMES,android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC);if(frame==null)continue;
        com.google.android.gms.tasks.Task<com.google.mlkit.vision.text.Text> task=reader.process(InputImage.fromBitmap(frame,0));task.addOnCompleteListener(done->frame.recycle());String result=com.google.android.gms.tasks.Tasks.await(task,4,java.util.concurrent.TimeUnit.SECONDS).getText();for(String line:result.split("\\n"))if(!line.trim().isEmpty())excerpts.add(line.trim());
        if(String.join("\n",excerpts).length()>=12000)break;
      }text=String.join("\n",excerpts);if(text.length()>12000)text=text.substring(0,12000);status=text.isEmpty()?"unavailable":"partial";
    }catch(Exception invalid){status="unavailable";}finally{if(reader!=null)reader.close();try{media.release();}catch(Exception ignored){}if(file!=null&&!closed)file.delete();activeOcr.remove(id);}
      final String result=text,finalStatus=status;activity.runOnUiThread(()->{updateText(id,result,finalStatus);resumePending();});
    }
    private void readImage(Uri uri,String ownerAtReceive,String caption){Bitmap bitmap=null;try{
      String actual=activity.getContentResolver().getType(uri);if(!TravelImportPolicy.imageMime(actual))throw new IllegalArgumentException();
      ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream input=activity.getContentResolver().openInputStream(uri)){if(input==null)throw new IllegalArgumentException();byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1){if(bytes.size()+count>MAX_BYTES)throw new IllegalArgumentException();bytes.write(buffer,0,count);}}
      byte[] source=bytes.toByteArray();if(!TravelImportPolicy.header(source,actual))throw new IllegalArgumentException();
      BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(source,0,source.length,options);
      if(!TravelImportPolicy.dimensions(options.outWidth,options.outHeight,40_000_000))throw new IllegalArgumentException();int sample=1;while(Math.max(options.outWidth,options.outHeight)/sample>2048)sample*=2;options.inJustDecodeBounds=false;options.inSampleSize=sample;
      bitmap=BitmapFactory.decodeByteArray(source,0,source.length,options);if(bitmap==null)throw new IllegalArgumentException();
      final Bitmap recognized=bitmap;final JSONObject job=new JSONObject();job.put("ownerUid",ownerAtReceive);job.put("mime",actual);job.put("sharedText",caption);job.put("text",caption);job.put("ocrStatus","reading");job.put("image",thumbnail(bitmap));final String fingerprint=digest(source);
      activity.runOnUiThread(()->{String jobId=enqueue(job,fingerprint);if(jobId.isEmpty()){recognized.recycle();return;}
        performOcr(jobId,recognized);
      });bitmap=null;
    }catch(Exception invalid){failure("Choose a JPEG, PNG or WebP image under 12 MB. The image could not be read; you can paste a caption or add a place manually.");}finally{if(bitmap!=null)bitmap.recycle();}}
    @JavascriptInterface public void recognizeImage(String data){
      if(closed||data==null||data.length()>140000||!data.matches("data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}")){failure("Choose a JPEG screenshot again.");return;}
      final String owner=uid();executor.execute(()->{Bitmap image=null;try{byte[] bytes=Base64.decode(data.substring(data.indexOf(',')+1),Base64.DEFAULT);BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);if(!TravelImportPolicy.dimensions(bounds.outWidth,bounds.outHeight,4_000_000))throw new IllegalArgumentException();image=BitmapFactory.decodeByteArray(bytes,0,bytes.length);if(image==null)throw new IllegalArgumentException();final Bitmap bitmap=image;final JSONObject job=new JSONObject();job.put("ownerUid",owner);job.put("mime","image/jpeg");job.put("image",data);job.put("text","");job.put("ocrStatus","reading");String fingerprint=digest(bytes);activity.runOnUiThread(()->{String id=enqueue(job,fingerprint);if(id.isEmpty()){bitmap.recycle();return;}performOcr(id,bitmap);});image=null;}catch(Exception invalid){failure("The screenshot could not be read. Keep the image and add a caption instead.");}finally{if(image!=null)image.recycle();}});
    }
    private void performOcr(String id,Bitmap bitmap){
      if(closed){bitmap.recycle();return;}activeOcr.add(id);
      try{com.google.mlkit.vision.text.TextRecognizer reader=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        reader.process(InputImage.fromBitmap(bitmap,0)).addOnSuccessListener(result->{String text=result.getText();updateText(id,text.substring(0,Math.min(12000,text.length())),text.length()>12000?"partial":"review");})
          .addOnFailureListener(f->updateText(id,"","unavailable")).addOnCompleteListener(done->{reader.close();bitmap.recycle();activeOcr.remove(id);resumePending();});
      }catch(RuntimeException unavailable){bitmap.recycle();activeOcr.remove(id);updateText(id,"","unavailable");resumePending();}
    }
    private void resumePending(){
      if(closed||!pageReady||activeOcr.size()>=3)return;
      try{JSONArray list=jobs();for(int i=0;i<list.length()&&activeOcr.size()<3;i++){JSONObject job=list.getJSONObject(i);String id=job.optString("id"),image=job.optString("image");
        if(!"reading".equals(job.optString("ocrStatus"))||!TravelImportPolicy.visible(job.optString("ownerUid"),uid())||!activeOcr.add(id))continue;
        if("video/mp4".equals(job.optString("mime"))){java.io.File file=videoFile(job);executor.execute(()->videoText(id,file));continue;}
        executor.execute(()->{Bitmap bitmap=null;try{if(image.length()>140000||!image.startsWith("data:image/jpeg;base64,"))throw new IllegalArgumentException();byte[] data=Base64.decode(image.substring(image.indexOf(',')+1),Base64.DEFAULT);BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(data,0,data.length,bounds);if(!TravelImportPolicy.dimensions(bounds.outWidth,bounds.outHeight,4_000_000))throw new IllegalArgumentException();bitmap=BitmapFactory.decodeByteArray(data,0,data.length);if(bitmap==null)throw new IllegalArgumentException();final Bitmap ready=bitmap;activity.runOnUiThread(()->performOcr(id,ready));bitmap=null;}catch(Exception invalid){activeOcr.remove(id);activity.runOnUiThread(()->updateText(id,"","unavailable"));}finally{if(bitmap!=null)bitmap.recycle();}});
      }}catch(Exception ignored){}
    }
    private static String thumbnail(Bitmap source)throws Exception{double scale=Math.min(1,1000.0/Math.max(source.getWidth(),source.getHeight()));Bitmap small=Bitmap.createScaledBitmap(source,Math.max(1,(int)(source.getWidth()*scale)),Math.max(1,(int)(source.getHeight()*scale)),true);String result="";for(int quality:new int[]{80,65,50,35}){ByteArrayOutputStream bytes=new ByteArrayOutputStream();small.compress(Bitmap.CompressFormat.JPEG,quality,bytes);result="data:image/jpeg;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP);if(result.length()<=140000)break;}if(small!=source)small.recycle();if(result.length()>140000)throw new IllegalArgumentException();return result;}
    private String enqueue(JSONObject job,String fingerprint){if(android.os.Looper.myLooper()!=android.os.Looper.getMainLooper()){activity.runOnUiThread(()->enqueue(job,fingerprint));return "";}if(closed)return "";try{String incomingOwner=job.has("ownerUid")?job.optString("ownerUid"):uid();JSONArray list=jobs();for(int i=0;i<list.length();i++)if(TravelImportPolicy.duplicate(list.getJSONObject(i).optString("ownerUid"),incomingOwner,list.getJSONObject(i).optString("fingerprint"),fingerprint)){error="This content is already waiting in your import inbox. Review the existing import.";post();return "";}
      if(System.currentTimeMillis()-prefs.getLong("seen:"+incomingOwner+":"+fingerprint,0)<300000){error="This content was recently reviewed. Paste a caption to start an explicit separate import.";post();return "";}if(list.length()>=TravelImportPolicy.MAX_JOBS){failure("Review an earlier import before sharing more.");return "";}
      String id="import_"+java.util.UUID.randomUUID();job.put("id",id);job.put("fingerprint",fingerprint);if(!job.has("ownerUid"))job.put("ownerUid",uid());job.put("createdAt",Instant.now().toString());list.put(job);save(list);error="";post();return id;
    }catch(Exception invalid){failure("The import could not be kept on this phone. Try pasting its link.");return "";}}
    private void updateText(String id,String text,String status){if(closed)return;try{JSONArray list=jobs();for(int i=0;i<list.length();i++){JSONObject job=list.getJSONObject(i);if(id.equals(job.optString("id"))){String combined=(job.optString("sharedText").isEmpty()?"":job.optString("sharedText")+"\n")+text;job.put("text",combined.substring(0,Math.min(12000,combined.length())));job.put("ocrStatus",status);}}save(list);post();}catch(Exception ignored){}}
    /** Pasted content joins the same durable inbox as Android shares. */
    @JavascriptInterface public boolean stageText(String text){
      if(closed||!TravelImportPolicy.text(text))return false;final String owner=uid();
      activity.runOnUiThread(()->{try{if(closed||!owner.equals(uid()))return;JSONObject job=new JSONObject();job.put("ownerUid",owner);job.put("text",text);job.put("mime","text/plain");job.put("ocrStatus","not-needed");enqueue(job,digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception invalid){failure("The caption could not be kept. Try again.");}});return true;
    }
    /** Local review only; no network call, ownership changes or destination writes. */
    @JavascriptInterface public void updateReview(String id,String source,String expectedUid){
      if(closed||source==null||source.length()>60000||expectedUid==null||!expectedUid.equals(uid()))return;
      activity.runOnUiThread(()->{if(closed||!expectedUid.equals(uid()))return;try{JSONObject draft=new JSONObject(source);JSONArray candidates=draft.getJSONArray("candidates");if(candidates.length()<1||candidates.length()>20)return;
        JSONArray list=jobs();for(int i=0;i<list.length();i++){JSONObject job=list.getJSONObject(i);if(id.equals(job.optString("id"))&&TravelImportPolicy.visible(job.optString("ownerUid"),expectedUid)){if(!expectedUid.isEmpty())job.put("ownerUid",expectedUid);job.put("reviewDraft",draft.toString());save(list);break;}}
      }catch(Exception ignored){}});
    }
    @JavascriptInterface public void refresh(){activity.runOnUiThread(this::post);}
    @JavascriptInterface public String image(String id){try{JSONArray list=jobs();for(int i=0;i<list.length();i++){JSONObject job=list.getJSONObject(i);if(id.equals(job.optString("id"))&&TravelImportPolicy.visible(job.optString("ownerUid"),uid()))return job.optString("image");}}catch(Exception ignored){}return "";}
    @JavascriptInterface public void claim(String id){activity.runOnUiThread(()->{if(uid().isEmpty())return;try{JSONArray list=jobs();for(int i=0;i<list.length();i++){JSONObject job=list.getJSONObject(i);if(id.equals(job.optString("id"))&&job.optString("ownerUid").isEmpty())job.put("ownerUid",uid());}save(list);post();}catch(Exception ignored){}});}
    @JavascriptInterface public void acknowledge(String id){activity.runOnUiThread(()->{try{JSONArray list=jobs(),keep=new JSONArray();for(int i=0;i<list.length();i++){JSONObject job=list.getJSONObject(i);boolean own=job.optString("ownerUid").isEmpty()||uid().equals(job.optString("ownerUid"));if(id.equals(job.optString("id"))&&own){java.io.File media=videoFile(job);if(media!=null)media.delete();prefs.edit().putLong("seen:"+job.optString("ownerUid")+":"+job.optString("fingerprint"),System.currentTimeMillis()).putLong("seen:"+uid()+":"+job.optString("fingerprint"),System.currentTimeMillis()).apply();}else keep.put(job);}save(keep);post();}catch(Exception ignored){}});}
    public void onPageReady(){pageReady=true;post();resumePending();}
    private void failure(String message){activity.runOnUiThread(()->{if(!closed){error=message;post();}});}
    private void post(){if(closed||!pageReady)return;try{JSONArray list=jobs(),visible=new JSONArray();for(int i=0;i<list.length();i++){JSONObject job=list.getJSONObject(i);if(!job.optString("ownerUid").isEmpty()&&!uid().equals(job.optString("ownerUid")))continue;JSONObject copy=new JSONObject(job.toString());copy.remove("image");copy.remove("fingerprint");copy.remove("videoFile");copy.put("hasImage",job.has("image"));visible.put(copy);}JSONObject data=new JSONObject();data.put("jobs",visible);data.put("error",error);view.evaluateJavascript("window.onUsTravelImports&&window.onUsTravelImports("+data+");",null);}catch(Exception ignored){}}
    public void close(){closed=true;auth.removeAuthStateListener(listener);executor.shutdownNow();}
}
