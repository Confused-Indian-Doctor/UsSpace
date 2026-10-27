package app.usspace.couple.v012;

import android.content.Context;
import android.content.SharedPreferences;
import android.health.connect.*;
import android.health.connect.changelog.*;
import android.health.connect.datatypes.*;
import android.health.connect.datatypes.Record;
import android.os.OutcomeReceiver;
import org.json.*;
import java.util.*;
import java.util.concurrent.Executor;
import java.util.function.Consumer;

/** Per-account incremental Samsung record-ID ledger. Summaries still use HC aggregation. */
public final class HealthRecordLedger {
    private final SharedPreferences prefs;private final HealthConnectManager manager;private final Executor executor;
    public HealthRecordLedger(Context c,Executor executor){prefs=c.getSharedPreferences("usspace.health.ledger.v1",0);manager=c.getSystemService(HealthConnectManager.class);this.executor=executor;}
    private static String field(Record r){if(r instanceof StepsRecord)return "steps";if(r instanceof SleepSessionRecord)return "sleep";if(r instanceof HeartRateRecord||r instanceof RestingHeartRateRecord)return "hr";if(r instanceof ExerciseSessionRecord)return "workout";return "";}
    public void sync(String uid,Set<Class<? extends Record>> types,String grantSignature,Consumer<JSONObject> done){if(uid.isEmpty()||types.isEmpty()){done.accept(new JSONObject());return;}String key=uid+":"+grantSignature;String token=prefs.getString(key+":token","");JSONObject records;try{records=new JSONObject(prefs.getString(key+":records","{}"));}catch(Exception invalid){records=new JSONObject();}
      if(token.isEmpty()){ChangeLogTokenRequest.Builder b=new ChangeLogTokenRequest.Builder().addDataOriginFilter(new DataOrigin.Builder().setPackageName(HealthSyncPolicy.SAMSUNG_PACKAGE).build());for(Class<? extends Record> t:types)b.addRecordType(t);manager.getChangeLogToken(b.build(),executor,new OutcomeReceiver<ChangeLogTokenResponse,HealthConnectException>(){public void onResult(ChangeLogTokenResponse r){prefs.edit().putString(key+":token",r.getToken()).putString(key+":records","{}").apply();done.accept(new JSONObject());}public void onError(HealthConnectException e){done.accept(new JSONObject());}});return;}
      page(key,token,records,new HashSet<>(),0,done);
    }
    private void page(String key,String token,JSONObject records,Set<String> deleted,int pages,Consumer<JSONObject> done){if(pages>=30){done.accept(new JSONObject());return;}manager.getChangeLogs(new ChangeLogsRequest.Builder(token).setPageSize(500).build(),executor,new OutcomeReceiver<ChangeLogsResponse,HealthConnectException>(){public void onResult(ChangeLogsResponse r){try{
      for(ChangeLogsResponse.DeletedLog d:r.getDeletedLogs()){String f=records.optString(d.getDeletedRecordId());if(!f.isEmpty())deleted.add(f);else deleted.addAll(Arrays.asList("steps","sleep","hr","workout"));records.remove(d.getDeletedRecordId());}
      for(Record item:r.getUpsertedRecords())if(HealthSyncPolicy.SAMSUNG_PACKAGE.equals(item.getMetadata().getDataOrigin().getPackageName())){String f=field(item);if(!f.isEmpty())records.put(item.getMetadata().getId(),f);}
      if(records.length()>20000){prefs.edit().remove(key+":token").remove(key+":records").apply();done.accept(new JSONObject());return;}
      if(r.hasMorePages()){page(key,r.getNextChangesToken(),records,deleted,pages+1,done);return;}
      prefs.edit().putString(key+":token",r.getNextChangesToken()).putString(key+":records",records.toString()).apply();JSONObject out=new JSONObject();out.put("deletedFields",new JSONArray(deleted));out.put("recordCount",records.length());out.put("incremental",true);done.accept(out);
    }catch(Exception invalid){done.accept(new JSONObject());}}public void onError(HealthConnectException e){prefs.edit().remove(key+":token").remove(key+":records").apply();done.accept(new JSONObject());}});}
}
