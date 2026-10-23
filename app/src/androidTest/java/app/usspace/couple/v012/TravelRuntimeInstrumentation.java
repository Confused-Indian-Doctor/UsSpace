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
 * Uses actual Auth/Firestore emulators and actual release Activity. No JS injection. */
public final class TravelRuntimeInstrumentation extends Instrumentation {
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
        Intent intent=new Intent(getTargetContext(),MainActivity.class);intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getTargetContext().startActivity(intent);
        BroadcastReceiver controls=new BroadcastReceiver(){@Override public void onReceive(Context context,Intent command){
          String action=command.getStringExtra("command");if(action==null)return;
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
