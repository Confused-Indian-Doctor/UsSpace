package app.usspace.couple.v012;

import android.app.Instrumentation;
import android.content.Intent;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.content.ContentValues;
import android.provider.MediaStore;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import java.util.concurrent.TimeUnit;

/** Separately installed QA APK, signed with the same certificate, never embedded in release.
 * Uses actual Auth/Firestore emulators and actual release Activity. Physical UI assertions; read-only demo travel diagnostics never mutate JavaScript state. */
public final class TravelRuntimeInstrumentation extends Instrumentation {
    private volatile android.app.Activity activeActivity;
    @Override public void callActivityOnResume(android.app.Activity activity){super.callActivityOnResume(activity);if(activity instanceof MainActivity)activeActivity=activity;}

    @Override public void onCreate(Bundle arguments){super.onCreate(arguments);start();}
    @Override public void onStart(){
      try{
        try{FirebaseApp.getInstance().delete();}catch(IllegalStateException ignored){}
        FirebaseApp app=FirebaseApp.initializeApp(getTargetContext(),new FirebaseOptions.Builder()
          .setProjectId("demo-usspace").setApplicationId("1:123456789:android:usspaceqa")
          .setApiKey("AIzaSyDemoUsSpaceEmulatorOnly00000000000").build());
        FirebaseAuth auth=FirebaseAuth.getInstance(app);auth.useEmulator("10.0.2.2",9099);
        FirebaseFirestore db=FirebaseFirestore.getInstance(app);db.useEmulator("10.0.2.2",8080);
        Tasks.await(auth.signInWithEmailAndPassword("travel-al@example.test","UsSpace-Emulator-Only-2026"),30,TimeUnit.SECONDS);
        ActivityMonitor qaMonitor=addMonitor(MainActivity.class.getName(),null,false);
        Intent intent=new Intent(getTargetContext(),MainActivity.class);intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getTargetContext().startActivity(intent);
        if(waitForMonitorWithTimeout(qaMonitor,30000)==null)throw new IllegalStateException("QA Activity not observed");
        BroadcastReceiver controls=new BroadcastReceiver(){@Override public void onReceive(Context context,Intent command){
          String action=command.getStringExtra("command");if(action==null)return;
          if(!"demo-usspace".equals(db.getApp().getOptions().getProjectId()))throw new IllegalStateException("Demo-only controls");
          if("pause-private-listeners".equals(action)||"resume-private-listeners".equals(action))try{
            java.lang.reflect.Field field=MainActivity.class.getDeclaredField("travelBridge");field.setAccessible(true);
            Object bridge=field.get(activeActivity);if(bridge==null)throw new IllegalStateException("Active bridge unavailable");
            if("pause-private-listeners".equals(action)){
              java.lang.reflect.Field listeners=TravelBridge.class.getDeclaredField("privateListeners");listeners.setAccessible(true);
              java.util.List<?> registrations=(java.util.List<?>)listeners.get(bridge);
              for(Object registration:registrations)((com.google.firebase.firestore.ListenerRegistration)registration).remove();registrations.clear();
              java.lang.reflect.Field watches=TravelBridge.class.getDeclaredField("reactionWatches");watches.setAccessible(true);
              ((java.util.Set<?>)watches.get(bridge)).removeIf(key->key.toString().startsWith("private:"));
            }else{
              java.lang.reflect.Field uid=TravelBridge.class.getDeclaredField("uid"),epoch=TravelBridge.class.getDeclaredField("epoch");uid.setAccessible(true);epoch.setAccessible(true);
              java.lang.reflect.Method attach=TravelBridge.class.getDeclaredMethod("attach",boolean.class,String.class,String.class,long.class);attach.setAccessible(true);
              attach.invoke(bridge,false,(String)uid.get(bridge),"",epoch.getLong(bridge));
            }
            Log.i("UsSpaceTravelQA","READY_"+action);
          }catch(Exception error){Log.e("UsSpaceTravelQA","LISTENER_CONTROL_FAILED",error);}

          if("diagnostics".equals(action))try{
            if(!"demo-usspace".equals(db.getApp().getOptions().getProjectId()))throw new IllegalStateException("Demo-only diagnostics");
            android.app.Activity active=activeActivity;
            java.lang.reflect.Field bridgeField=MainActivity.class.getDeclaredField("travelBridge");bridgeField.setAccessible(true);Object bridge=bridgeField.get(active);
            java.lang.reflect.Field uidField=TravelBridge.class.getDeclaredField("uid");uidField.setAccessible(true);
            Log.i("UsSpaceTravelQA","DEMO_NATIVE_UID "+uidField.get(bridge));
            java.lang.reflect.Field prefsField=TravelBridge.class.getDeclaredField("prefs");prefsField.setAccessible(true);android.content.SharedPreferences nativePrefs=(android.content.SharedPreferences)prefsField.get(bridge);
            Log.i("UsSpaceTravelQA","DEMO_NATIVE_QUEUE_KEYS "+nativePrefs.getAll().keySet());
            java.lang.reflect.Field webField=MainActivity.class.getDeclaredField("webView");webField.setAccessible(true);android.webkit.WebView web=(android.webkit.WebView)webField.get(active);
            web.evaluateJavascript("JSON.stringify({uid:UsTravel.get().uid,pending:UsTravel.get().pending.length,titles:UsTravel.get().items.map(x=>x.title),bridgeType:typeof AndroidTravel,applyType:typeof AndroidTravel.apply,applySource:String(AndroidTravel.apply)})",value->Log.i("UsSpaceTravelQA","DEMO_TRAVEL_READ_ONLY "+value));
            org.json.JSONArray queue=new org.json.JSONArray(getTargetContext().getSharedPreferences("usspace.travel.v1",0).getString("queue:travel_qa_al","[]"));
            org.json.JSONArray titles=new org.json.JSONArray();
            for(int q=0;q<queue.length();q++){org.json.JSONArray changes=queue.getJSONObject(q).getJSONArray("changes");for(int c=0;c<changes.length();c++)titles.put(changes.getJSONObject(c).getJSONObject("fields").optString("title",changes.getJSONObject(c).optString("kind")));}
            Log.i("UsSpaceTravelQA","DEMO_QUEUE_DIAGNOSTICS count="+queue.length()+" titles="+titles);
          }catch(Exception error){Log.e("UsSpaceTravelQA","DEMO_QUEUE_DIAGNOSTICS_FAILED",error);}
          if("offline".equals(action))db.disableNetwork().addOnSuccessListener(x->Log.i("UsSpaceTravelQA","READY_OFFLINE"));
          if("online".equals(action))db.enableNetwork().addOnSuccessListener(x->Log.i("UsSpaceTravelQA","READY_ONLINE"));
          if("partner".equals(action))auth.signInWithEmailAndPassword("travel-partner@example.test","UsSpace-Emulator-Only-2026").addOnSuccessListener(x->Log.i("UsSpaceTravelQA","READY_PARTNER"));
          if("al".equals(action))auth.signInWithEmailAndPassword("travel-al@example.test","UsSpace-Emulator-Only-2026").addOnSuccessListener(x->Log.i("UsSpaceTravelQA","READY_AL"));
          if("share-text".equals(action)){Intent share=new Intent(getTargetContext(),MainActivity.class).setAction(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,"https://www.openstreetmap.org/?mlat=55.879&mlon=-4.29");share.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);getTargetContext().startActivity(share);}
          if("share-image".equals(action))try{Bitmap bitmap=Bitmap.createBitmap(1200,600,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(bitmap);canvas.drawColor(Color.WHITE);Paint paint=new Paint();paint.setColor(Color.BLACK);paint.setTextSize(54);canvas.drawText("Glasgow Botanic Gardens",70,200,paint);canvas.drawText("A little weekend idea",70,300,paint);ContentValues values=new ContentValues();values.put(MediaStore.Images.Media.DISPLAY_NAME,"UsSpace-QA-OCR.jpg");values.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");Uri uri=getTargetContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);if(uri==null)throw new IllegalStateException("image insert failed");try(java.io.OutputStream stream=getTargetContext().getContentResolver().openOutputStream(uri)){bitmap.compress(Bitmap.CompressFormat.JPEG,90,stream);}bitmap.recycle();Intent share=new Intent(getTargetContext(),MainActivity.class).setAction(Intent.ACTION_SEND).setType("image/jpeg").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_CLEAR_TOP);getTargetContext().startActivity(share);}catch(Exception error){Log.e("UsSpaceTravelQA","QA_IMAGE_FAILED",error);}
        }};
        getTargetContext().registerReceiver(controls,new IntentFilter("app.usspace.TRAVEL_QA"),Context.RECEIVER_EXPORTED);
        Log.i("UsSpaceTravelQA","READY_AUTH_FIRESTORE_EMULATORS");
        // Keep the configured native SDK alive while the external accessibility harness
        // exercises real release UI. The disposable emulator is destroyed after the run.
        for(int i=0;i<2700;i++)Thread.sleep(1000);
        finish(0,new Bundle());
      }catch(Exception error){Log.e("UsSpaceTravelQA","QA_SETUP_FAILED",error);Bundle result=new Bundle();result.putString("error",error.toString());finish(1,result);}
    }
}
