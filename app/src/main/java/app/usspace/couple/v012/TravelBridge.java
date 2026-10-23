package app.usspace.couple.v012;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.google.firebase.Timestamp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.FirebaseFirestoreException;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;
import com.google.firebase.firestore.Source;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;

/** Travel-only, account-scoped CRUD. Existing UsExtras/Health bridges remain independent. */
public final class TravelBridge {
    private static final String[] KINDS={"item","collection","trip","stop","import","memory","photo"};
    private static final String[] COLLECTIONS={"travelItems","travelCollections","travelTrips","travelStops","travelImports","travelMemories","travelPhotos"};
    private static final String[] BASE={"schemaVersion","id","ownerUid","visibility","pairId","revision","deleted","createdAt","updatedAt","updatedBy"};
    private static final String[][] FIELDS={
      {"title","kind","category","location","targetDate","priority","description","sourceUrl","sourceKey","extractionStatus","confidence","verifiedPlace","collectionIds","status","photoIds","completedDate","legacyId"},
      {"title","description","color"},
      {"title","destination","startDate","endDate","timezone","currency","budget","travelMode","pace","status"},
      {"tripId","bucketItemId","title","localDate","orderKey","startTime","durationMinutes","travelMode","estimatedCost","notes","kind","fixed","sourceUrl"},
      {"sourceUrl","sourceKey","text","imageId","extractionStatus","confidence","candidateIds"},
      {"bucketItemId","tripId","title","localDate","location","photoIds","reflection"},
      {"data"}};
    private final Activity activity; private final WebView view;
    private final FirebaseAuth auth=FirebaseAuth.getInstance();
    private final FirebaseFirestore db=FirebaseFirestore.getInstance();
    private final SharedPreferences prefs;
    private final FirebaseAuth.AuthStateListener authListener;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final java.util.concurrent.ExecutorService providerNetwork=java.util.concurrent.Executors.newSingleThreadExecutor();
    private final List<ListenerRegistration> privateListeners=new ArrayList<>(), sharedListeners=new ArrayList<>();
    private final Map<String,Map<String,Object>> records=java.util.Collections.synchronizedMap(new LinkedHashMap<>());
    private final Map<String,Map<String,Object>> reactions=java.util.Collections.synchronizedMap(new LinkedHashMap<>());
    private final Set<String> reactionWatches=new HashSet<>();
    private ListenerRegistration userListener,memberListener,roomListener;
    private volatile String uid="",pair="",error=""; private volatile long epoch;
    private volatile boolean closed,ready,pageReady; private boolean sending;
    public TravelBridge(Activity activity,WebView view){this.activity=activity;this.view=view;
      prefs=activity.getSharedPreferences("usspace.travel.v1",0);
      authListener=a->activity.runOnUiThread(this::observeAuth);auth.addAuthStateListener(authListener);}
    private static boolean id(String value){return value!=null&&value.matches("[A-Za-z0-9_-]{1,140}");}
    private static int kind(String value){return Arrays.asList(KINDS).indexOf(value);}
    private boolean account(String account,long token){FirebaseUser user=auth.getCurrentUser();return !closed&&epoch==token&&uid.equals(account)&&user!=null&&account.equals(user.getUid());}
    private void observeAuth(){FirebaseUser user=auth.getCurrentUser();String next=user==null?"":user.getUid();if(next.equals(uid))return;
      pruneOffline(uid, "");detach(privateListeners);clearShared();if(userListener!=null)userListener.remove();userListener=null;epoch++;sending=false;records.clear();reactions.clear();reactionWatches.clear();error="";uid=next;post();
      if(uid.isEmpty())return;String account=uid;long token=epoch;
      attach(false,account,"",token);
      userListener=db.collection("users").document(account).addSnapshotListener(MetadataChanges.INCLUDE,(snapshot,failure)->{
        if(!account(account,token))return;
        if(failure!=null){clearShared();error="Your shared travel space needs a connection check.";post();return;}
        if(snapshot==null||snapshot.getMetadata().isFromCache())return;
        String destination=snapshot.exists()?snapshot.getString("coupleId"):"";if(!id(destination))destination="";pruneOffline(account,destination);
        if(!destination.equals(pair)){String old=pair;clearShared();pair=destination;purgeShared(old);post();if(!pair.isEmpty())verifyPair(account,pair,token);}
        drain();
      });drain();}
    private void clearShared(){detach(sharedListeners);if(memberListener!=null)memberListener.remove();if(roomListener!=null)roomListener.remove();memberListener=roomListener=null;
      ready=false;pair="";reactionWatches.removeIf(x->x.startsWith("shared:"));records.entrySet().removeIf(x->x.getKey().startsWith("shared:"));reactions.entrySet().removeIf(x->x.getKey().startsWith("shared:"));}
    private static void detach(List<ListenerRegistration> listeners){for(ListenerRegistration l:listeners)l.remove();listeners.clear();}
    private void verifyPair(String account,String space,long token){
      memberListener=db.collection("couples").document(space).collection("members").document(account).addSnapshotListener(MetadataChanges.INCLUDE,(member,failure)->{
        if(!account(account,token)||!space.equals(pair))return;
        if(failure!=null||member!=null&&!member.getMetadata().isFromCache()&&!member.exists()){boolean revoked=member!=null&&!member.getMetadata().isFromCache()&&!member.exists();clearShared();if(revoked)purgeShared(space);error="This paired travel space is no longer available.";post();return;}
        if(member==null||member.getMetadata().isFromCache()||!member.exists()||ready)return;
        db.collection("couples").document(space).get(Source.SERVER).addOnSuccessListener(room->{if(!account(account,token)||!space.equals(pair))return;
          Long count=room.getLong("memberCount");if(count==null||count!=2){error="Both phones need to be paired before sharing travel.";post();return;}
          ready=true;attach(true,account,space,token);post();drain();
        });
      });
      roomListener=db.collection("couples").document(space).addSnapshotListener(MetadataChanges.INCLUDE,(room,failure)->{
        if(!account(account,token)||!space.equals(pair))return;
        if(failure!=null||room!=null&&!room.getMetadata().isFromCache()&&(!room.exists()||!Long.valueOf(2).equals(room.getLong("memberCount")))){
          boolean revoked=room!=null&&!room.getMetadata().isFromCache()&&(!room.exists()||!Long.valueOf(2).equals(room.getLong("memberCount")));clearShared();if(revoked)purgeShared(space);error="Your shared travel plans are locked until both phones are paired.";post();}
      });}
    private DocumentReference root(boolean shared,String account,String space){return db.collection(shared?"couples":"users").document(shared?space:account);}
    private void attach(boolean shared,String account,String space,long token){String visibility=shared?"shared":"private";
      for(int index=0;index<KINDS.length;index++){if(shared&&index==4)continue;final String recordKind=KINDS[index];final int recordIndex=index;
        ListenerRegistration listener=root(shared,account,space).collection(COLLECTIONS[index]).limit(250).addSnapshotListener(MetadataChanges.INCLUDE,(snapshot,failure)->{
          if(!account(account,token)||shared&&(!ready||!space.equals(pair)))return;
          String prefix=visibility+":"+recordKind+":";
          if(failure!=null){records.entrySet().removeIf(x->x.getKey().startsWith(prefix));error="Some plans could not sync. Reconnect and retry; pending edits stay on this phone.";post();return;}
          if(snapshot==null)return;
          records.entrySet().removeIf(x->x.getKey().startsWith(prefix));
          for(DocumentSnapshot doc:snapshot.getDocuments()){
            if(doc.getLong("schemaVersion")==null||doc.getLong("schemaVersion")!=1)continue;
            Map<String,Object> data=new HashMap<>(doc.getData());data.put("_kind",recordKind);data.put("_cached",snapshot.getMetadata().isFromCache());records.put(prefix+doc.getId(),data);
            if(recordIndex==0&&!Boolean.TRUE.equals(data.get("deleted")))watchReactions(shared,account,space,token,doc.getId());
          }
          pruneAcknowledged();if(snapshot.size()==250)error="Showing the first 250 saved records. Narrow your collection before adding more.";post();
        });(shared?sharedListeners:privateListeners).add(listener);
      }}
    private void watchReactions(boolean shared,String account,String space,long token,String itemId){String key=(shared?"shared":"private")+":"+itemId;
      if(!reactionWatches.add(key))return;
      ListenerRegistration listener=root(shared,account,space).collection("travelItems").document(itemId).collection("reactions").addSnapshotListener((snapshot,failure)->{
        if(!account(account,token)||shared&&(!ready||!space.equals(pair)))return;
        reactions.entrySet().removeIf(x->x.getKey().startsWith(key+":"));
        if(snapshot!=null&&failure==null)for(DocumentSnapshot doc:snapshot.getDocuments()){Map<String,Object> data=new HashMap<>(doc.getData());data.put("itemId",itemId);data.put("visibility",shared?"shared":"private");reactions.put(key+":"+doc.getId(),data);}post();
      });(shared?sharedListeners:privateListeners).add(listener);}
    private JSONArray queue(){try{return new JSONArray(prefs.getString("queue:"+uid,"[]"));}catch(Exception ignored){return new JSONArray();}}
    private boolean store(JSONArray queue){return prefs.edit().putString("queue:"+uid,queue.toString()).commit();}
    private synchronized void purgeShared(String old){if(uid.isEmpty()||old.isEmpty())return;pruneOffline(uid, "");try{JSONArray q=queue();Map<String,List<String>> dependencies=new HashMap<>();Set<String> removed=new HashSet<>();for(int i=0;i<q.length();i++){JSONObject op=q.getJSONObject(i);List<String> parents=new ArrayList<>();JSONArray refs=op.optJSONArray("dependsOn");if(refs!=null)for(int n=0;n<refs.length();n++)parents.add(refs.getString(n));dependencies.put(op.getString("operationId"),parents);JSONArray changes=op.getJSONArray("changes");for(int n=0;n<changes.length();n++)if(old.equals(changes.getJSONObject(n).optString("pairId")))removed.add(op.getString("operationId"));}Set<String> all=new HashSet<>(removed);for(String id:removed)all.addAll(TravelQueuePolicy.descendants(id,dependencies));JSONArray keep=new JSONArray();for(int i=0;i<q.length();i++)if(!all.contains(q.getJSONObject(i).optString("operationId")))keep.put(q.getJSONObject(i));store(keep);}catch(Exception ignored){}}
    @JavascriptInterface public boolean apply(String source){
      if(source==null||source.length()>210000)return false;
      final JSONObject operation;final String account=uid;
      try{operation=new JSONObject(source);for(String key:keys(operation))if(!Arrays.asList("operationId","actorUid","changes","dependsOn").contains(key))return false;FirebaseUser actor=auth.getCurrentUser();if(!TravelQueuePolicy.actor(operation.optString("actorUid"),account,actor==null?"":actor.getUid()))return false;if(!id(operation.getString("operationId")))return false;JSONArray dependencies=operation.optJSONArray("dependsOn");if(dependencies!=null){if(dependencies.length()>40)return false;for(int n=0;n<dependencies.length();n++)if(!id(dependencies.getString(n))||operation.getString("operationId").equals(dependencies.getString(n)))return false;}JSONArray changes=operation.getJSONArray("changes");if(changes.length()<1||changes.length()>40)return false;
        for(int i=0;i<changes.length();i++){JSONObject c=changes.getJSONObject(i);int k=kind(c.getString("kind"));if(k<0||!id(c.getString("id")))return false;
          if(!Arrays.asList("private","shared").contains(c.getString("visibility")))return false;if("shared".equals(c.getString("visibility"))&&(!ready||!pair.equals(c.optString("pairId"))))return false;
          JSONObject fields=c.getJSONObject("fields");Set<String> allowed=new HashSet<>(Arrays.asList(BASE));allowed.addAll(Arrays.asList(FIELDS[k]));for(String key:keys(fields))if(!allowed.contains(key))return false;
          if(fields.has("ownerUid")&&!account.equals(fields.getString("ownerUid"))&&"private".equals(c.getString("visibility")))return false;
        }
      }catch(Exception invalid){return false;}
      if(account.isEmpty())return false;
      synchronized(this){if(!account.equals(uid)||closed||auth.getCurrentUser()==null||!account.equals(auth.getCurrentUser().getUid()))return false;
        JSONArray q=queue();if(q.length()>=60||q.toString().length()+source.length()>2500000)return false;
        for(int i=0;i<q.length();i++)if(operation.optString("operationId").equals(q.optJSONObject(i).optString("operationId")))return true;
        q.put(operation);if(!store(q))return false;
      }
      activity.runOnUiThread(()->{if(!account.equals(uid)||closed)return;error="";post();drain();});return true;
    }
    // A server commit can precede listener delivery. Keep its durable overlay until
    // every affected revision is observed; an SDK network pause must not hide it.
    private synchronized boolean acknowledgeOperation(String operationId){try{JSONArray q=queue();for(int i=0;i<q.length();i++)if(operationId.equals(q.getJSONObject(i).optString("operationId")))q.getJSONObject(i).put("acknowledged",true);return store(q);}catch(Exception ignored){return false;}}
    private synchronized void pruneAcknowledged(){try{JSONArray q=queue(),keep=new JSONArray();for(int i=0;i<q.length();i++){JSONObject op=q.getJSONObject(i);boolean covered=op.optBoolean("acknowledged");JSONArray changes=op.getJSONArray("changes");for(int n=0;covered&&n<changes.length();n++){JSONObject c=changes.getJSONObject(n);Map<String,Object> current=records.get(c.getString("visibility")+":"+c.getString("kind")+":"+c.getString("id"));Object revision=current==null?null:current.get("revision");covered=TravelQueuePolicy.snapshotCovers(c.getLong("expectedRevision"),revision instanceof Number?((Number)revision).longValue():null);}if(!covered)keep.put(op);}if(keep.length()!=q.length())store(keep);}catch(Exception ignored){}}

    private static List<String> keys(JSONObject o){List<String> result=new ArrayList<>();java.util.Iterator<String> it=o.keys();while(it.hasNext())result.add(it.next());return result;}
    private static Object unpack(Object value)throws Exception{if(value==JSONObject.NULL)return null;if(value instanceof JSONObject){Map<String,Object> result=new HashMap<>();JSONObject object=(JSONObject)value;for(String k:keys(object))result.put(k,unpack(object.get(k)));return result;}if(value instanceof JSONArray){List<Object> result=new ArrayList<>();JSONArray a=(JSONArray)value;for(int i=0;i<a.length();i++)result.add(unpack(a.get(i)));return result;}return value;}
    private void drain(){if(closed||sending||uid.isEmpty())return;JSONArray pending=queue();JSONObject candidate=null;for(int i=0;i<pending.length();i++)if(!pending.optJSONObject(i).optBoolean("acknowledged")){candidate=pending.optJSONObject(i);break;}final JSONObject op=candidate;if(op==null)return;
      final String account=uid;final long token=epoch;final JSONArray changes=op.optJSONArray("changes");if(changes==null)return;
      for(int i=0;i<changes.length();i++){JSONObject c=changes.optJSONObject(i);if("shared".equals(c.optString("visibility"))&&(!ready||!pair.equals(c.optString("pairId"))))return;}
      sending=true;post();
      db.runTransaction(tx->{try { if(!account(account,token))throw new IllegalStateException("Account changed");
        DocumentReference receipt=db.collection("users").document(account).collection("travelReceipts").document(op.getString("operationId"));
        if(tx.get(receipt).exists())return null;JSONArray dependencies=op.optJSONArray("dependsOn");if(dependencies!=null)for(int n=0;n<dependencies.length();n++)if(!tx.get(db.collection("users").document(account).collection("travelReceipts").document(dependencies.getString(n))).exists())throw new IllegalStateException("TRAVEL_DEPENDENCY");
        boolean shared=false;String space="";for(int i=0;i<changes.length();i++)if("shared".equals(changes.getJSONObject(i).getString("visibility"))){shared=true;space=changes.getJSONObject(i).getString("pairId");}
        if(shared){DocumentSnapshot profile=tx.get(db.collection("users").document(account)),room=tx.get(db.collection("couples").document(space)),member=tx.get(db.collection("couples").document(space).collection("members").document(account));
          if(!space.equals(profile.getString("coupleId"))||!member.exists()||!Long.valueOf(2).equals(room.getLong("memberCount")))throw new IllegalStateException("Pairing changed");}
        List<DocumentReference> refs=new ArrayList<>();List<DocumentSnapshot> current=new ArrayList<>();
        Set<String> targets=new HashSet<>();for(int i=0;i<changes.length();i++){JSONObject c=changes.getJSONObject(i);String visibility=c.getString("visibility"),destination=c.optString("pairId");
          if("shared".equals(visibility)&&!space.equals(destination))throw new IllegalStateException("Different pairs");
          DocumentReference ref=root("shared".equals(visibility),account,destination).collection(COLLECTIONS[kind(c.getString("kind"))]).document(c.getString("id"));if(!targets.add(ref.getPath()))throw new IllegalStateException("Repeated target");refs.add(ref);current.add(tx.get(ref));}
        for(int i=0;i<changes.length();i++){JSONObject c=changes.getJSONObject(i);DocumentSnapshot old=current.get(i);long expected=c.getLong("expectedRevision");Long revision=old.exists()?old.getLong("revision"):0L;
          if(revision==null||revision!=expected||old.exists()&&Boolean.TRUE.equals(old.getBoolean("deleted")))throw new IllegalStateException("TRAVEL_CONFLICT");
          @SuppressWarnings("unchecked") Map<String,Object> data=(Map<String,Object>)unpack(c.getJSONObject("fields"));
          data.put("id",c.getString("id"));data.put("schemaVersion",1);data.put("ownerUid",old.exists()?old.getString("ownerUid"):account);data.put("visibility",c.getString("visibility"));data.put("pairId","shared".equals(c.getString("visibility"))?space:"");data.put("revision",expected+1);data.put("deleted",Boolean.TRUE.equals(data.get("deleted")));data.put("updatedAt",FieldValue.serverTimestamp());data.put("createdAt",old.exists()?old.get("createdAt"):FieldValue.serverTimestamp());data.put("updatedBy",account);tx.set(refs.get(i),data);}
        Map<String,Object> proof=new HashMap<>();proof.put("uid",account);proof.put("at",FieldValue.serverTimestamp());tx.set(receipt,proof);return null;
        } catch(Exception invalid) { throw new FirebaseFirestoreException(invalid.getMessage()==null?"Travel edit failed":invalid.getMessage(),FirebaseFirestoreException.Code.FAILED_PRECONDITION); }
      }).addOnCompleteListener(task->{if(!account(account,token))return;sending=false;
        if(task.isSuccessful()){if(!acknowledgeOperation(op.optString("operationId"))){error="Your edit reached the server. Keep this phone open while its confirmation is saved.";post();handler.postDelayed(this::drain,15000);return;}pruneAcknowledged();error="";post();drain();}
        else{Throwable cause=task.getException();boolean conflict=false;for(Throwable t=cause;t!=null;t=t.getCause())if(t.getMessage()!=null&&(t.getMessage().contains("TRAVEL_CONFLICT")||t.getMessage().contains("TRAVEL_DEPENDENCY")))conflict=true;
          error=conflict?"A plan changed on the other phone. Your pending edit is kept; review or discard it before retrying.":"Saved on this phone, waiting to sync. Check your connection and travel permissions.";post();if(!conflict)handler.postDelayed(this::drain,15000);}
      });}
    @JavascriptInterface public void react(String itemId,String visibility,String interest,int rating,String expectedUid,String expectedPair){activity.runOnUiThread(()->{
      FirebaseUser actor=auth.getCurrentUser();if(!TravelQueuePolicy.actor(expectedUid,uid,actor==null?"":actor.getUid())||"shared".equals(visibility)&&!pair.equals(expectedPair))return;
      if(!id(itemId)||uid.isEmpty()||!Arrays.asList("interested","maybe","not-for-me").contains(interest)||rating<0||rating>5||!Arrays.asList("private","shared").contains(visibility)||"shared".equals(visibility)&&!ready)return;
      Map<String,Object> data=new HashMap<>();data.put("schemaVersion",1);data.put("uid",uid);data.put("interest",interest);data.put("rating",rating);data.put("updatedAt",FieldValue.serverTimestamp());
      root("shared".equals(visibility),uid,pair).collection("travelItems").document(itemId).collection("reactions").document(uid).set(data).addOnFailureListener(f->{error="Your interest could not sync. Please retry.";post();});
    });}
    @JavascriptInterface public void discardPending(String operationId){activity.runOnUiThread(()->{if(sending)return;discardTree(operationId);error="";post();drain();});}
    @JavascriptInterface public String photo(String photoId,String visibility){FirebaseUser user=auth.getCurrentUser();if(!id(photoId)||uid.isEmpty()||user==null||!uid.equals(user.getUid())||!Arrays.asList("private","shared").contains(visibility)||"shared".equals(visibility)&&!ready)return "";Map<String,Object> photo=records.get(visibility+":photo:"+photoId);if(photo!=null&&photo.get("data") instanceof String&&("private".equals(visibility)?uid.equals(photo.get("ownerUid")):pair.equals(photo.get("pairId"))))return (String)photo.get("data");try{JSONArray q=queue();for(int i=0;i<q.length();i++){JSONArray changes=q.getJSONObject(i).getJSONArray("changes");for(int n=0;n<changes.length();n++){JSONObject c=changes.getJSONObject(n);if("photo".equals(c.optString("kind"))&&photoId.equals(c.optString("id"))&&visibility.equals(c.optString("visibility"))&&(!"shared".equals(visibility)||pair.equals(c.optString("pairId"))))return c.getJSONObject("fields").optString("data");}}}catch(Exception ignored){}return "";}
    private synchronized void discardTree(String operationId){try{JSONArray q=queue();for(int i=0;i<q.length();i++)if(operationId.equals(q.getJSONObject(i).optString("operationId"))&&q.getJSONObject(i).optBoolean("acknowledged"))return;Map<String,List<String>> dependencies=new HashMap<>();for(int i=0;i<q.length();i++){JSONObject op=q.getJSONObject(i);List<String> parents=new ArrayList<>();JSONArray refs=op.optJSONArray("dependsOn");if(refs!=null)for(int n=0;n<refs.length();n++)parents.add(refs.getString(n));dependencies.put(op.getString("operationId"),parents);}Set<String> remove=TravelQueuePolicy.descendants(operationId,dependencies);JSONArray keep=new JSONArray();for(int i=0;i<q.length();i++)if(!remove.contains(q.getJSONObject(i).optString("operationId")))keep.put(q.getJSONObject(i));store(keep);}catch(Exception ignored){}}
    private boolean offlineActor(String expectedUid){FirebaseUser actor=auth.getCurrentUser();return !closed&&!uid.isEmpty()&&TravelQueuePolicy.actor(expectedUid,uid,actor==null?"":actor.getUid());}
    private JSONArray offlineCopies(String account){try{return new JSONArray(prefs.getString("offline:"+account,"[]"));}catch(Exception ignored){return new JSONArray();}}
    private synchronized void pruneOffline(String account,String allowedPair){if(account.isEmpty())return;JSONArray old=offlineCopies(account),keep=new JSONArray();for(int i=0;i<old.length();i++){JSONObject copy=old.optJSONObject(i),trip=copy==null?null:copy.optJSONObject("trip");if(trip!=null&&("private".equals(trip.optString("visibility"))||!allowedPair.isEmpty()&&allowedPair.equals(trip.optString("pairId"))))keep.put(copy);}prefs.edit().putString("offline:"+account,keep.toString()).putString("offlinePair:"+account,allowedPair).commit();}
    @JavascriptInterface public synchronized boolean saveOfflineTrip(String tripId,String visibility,String expectedUid){
      if(!offlineActor(expectedUid)||!id(tripId)||!Arrays.asList("private","shared").contains(visibility)||"shared".equals(visibility)&&!ready)return false;
      String account=uid;long token=epoch;
      Map<String,Object> parent=records.get(visibility+":trip:"+tripId);
      if(parent==null||Boolean.TRUE.equals(parent.get("deleted"))||("private".equals(visibility)?!account.equals(parent.get("ownerUid")):!pair.equals(parent.get("pairId"))))return false;
      try{JSONObject copy=new JSONObject();copy.put("savedAt",Instant.now().toString());copy.put("trip",json(parent));JSONArray stops=new JSONArray();synchronized(records){for(Map<String,Object> stop:records.values())if("stop".equals(stop.get("_kind"))&&tripId.equals(stop.get("tripId"))&&visibility.equals(stop.get("visibility"))&&!Boolean.TRUE.equals(stop.get("deleted"))&&("private".equals(visibility)?account.equals(stop.get("ownerUid")):pair.equals(stop.get("pairId"))))stops.put(json(stop));}copy.put("stops",stops);if(copy.toString().length()>300000)return false;
        JSONArray old=offlineCopies(account),next=new JSONArray();for(int i=0;i<old.length();i++){JSONObject current=old.getJSONObject(i),trip=current.getJSONObject("trip");if(!(tripId.equals(trip.optString("id"))&&visibility.equals(trip.optString("visibility"))))next.put(current);}if(next.length()>=12)return false;next.put(copy);if(next.toString().length()>1500000||!account(account,token))return false;
        SharedPreferences.Editor edit=prefs.edit().putString("offline:"+account,next.toString());if("shared".equals(visibility))edit.putString("offlinePair:"+account,pair);return edit.commit();
      }catch(Exception invalid){return false;}
    }
    @JavascriptInterface public synchronized String offlineTrips(String expectedUid){if(!offlineActor(expectedUid))return "[]";String account=uid,knownPair=prefs.getString("offlinePair:"+account,"");JSONArray old=offlineCopies(account),visible=new JSONArray();for(int i=0;i<old.length();i++){JSONObject copy=old.optJSONObject(i),trip=copy==null?null:copy.optJSONObject("trip");if(trip!=null&&("private".equals(trip.optString("visibility"))?account.equals(trip.optString("ownerUid")):!knownPair.isEmpty()&&knownPair.equals(trip.optString("pairId"))))visible.put(copy);}return offlineActor(expectedUid)?visible.toString():"[]";}
    @JavascriptInterface public synchronized boolean removeOfflineTrip(String tripId,String visibility,String expectedUid){if(!offlineActor(expectedUid)||!id(tripId))return false;JSONArray old=offlineCopies(uid),keep=new JSONArray();for(int i=0;i<old.length();i++){JSONObject copy=old.optJSONObject(i),trip=copy==null?null:copy.optJSONObject("trip");if(trip!=null&&!(tripId.equals(trip.optString("id"))&&visibility.equals(trip.optString("visibility"))))keep.put(copy);}return prefs.edit().putString("offline:"+uid,keep.toString()).commit();}

    @JavascriptInterface public boolean requestProvider(String kind,String requestId,String source,String expectedUid){
      if(closed||!id(requestId)||source==null||source.length()>32000||!Arrays.asList("capabilities","plan","import","place-search","nearby","weather","route").contains(kind))return false;
      FirebaseUser user=auth.getCurrentUser();String account=user==null?"":user.getUid();if(!account.equals(uid)||!account.equals(expectedUid)||!"capabilities".equals(kind)&&account.isEmpty())return false;
      JSONObject body;try{body=new JSONObject(source);List<String> allowed="plan".equals(kind)?Arrays.asList("tripId","visibility","pairId","expectedRevision","selectedItemIds","windowStart","windowEnd","options","mode"):"import".equals(kind)?Arrays.asList("sourceUrl"):"place-search".equals(kind)?Arrays.asList("query"):"nearby".equals(kind)?Arrays.asList("itemId","visibility","pairId"):"weather".equals(kind)?Arrays.asList("itemId","visibility","pairId","timezone"):"route".equals(kind)?Arrays.asList("fromItemId","toItemId","visibility","pairId","travelMode"):java.util.Collections.emptyList();for(String key:keys(body))if(!allowed.contains(key))return false;
        if("plan".equals(kind)){if(!id(body.getString("tripId"))||!Arrays.asList("private","shared").contains(body.getString("visibility")))return false;if("shared".equals(body.getString("visibility"))&&(!ready||!pair.equals(body.optString("pairId"))))return false;JSONArray selected=body.getJSONArray("selectedItemIds");if(selected.length()<1||selected.length()>20)return false;for(int i=0;i<selected.length();i++)if(!id(selected.getString(i)))return false;JSONObject options=body.getJSONObject("options");for(String key:keys(options)){if(!Arrays.asList("startTime","endTime","visitMinutes","mealMinutes","restMinutes","mealTime","restTime","pace","interests","startPlaceId","endPlaceId").contains(key))return false;Object value=options.get(key);if("interests".equals(key)){if(!(value instanceof JSONArray)||((JSONArray)value).length()>8)return false;for(int n=0;n<((JSONArray)value).length();n++)if(!(((JSONArray)value).get(n) instanceof String)||((JSONArray)value).getString(n).length()>80)return false;}else if(!(value instanceof String)&&!(value instanceof Number)||value instanceof String&&((String)value).length()>240)return false;}}
        if("place-search".equals(kind)&&(!(body.get("query") instanceof String)||body.getString("query").trim().isEmpty()||body.getString("query").length()>240))return false;
        if(Arrays.asList("nearby","weather","route").contains(kind)){if(!Arrays.asList("private","shared").contains(body.getString("visibility")))return false;if("shared".equals(body.getString("visibility"))&&(!ready||!pair.equals(body.optString("pairId"))))return false;if(!id(body.getString("route".equals(kind)?"fromItemId":"itemId")))return false;if("route".equals(kind)&&!id(body.getString("toItemId")))return false;if("weather".equals(kind)&&(!(body.get("timezone") instanceof String)||body.getString("timezone").length()>80))return false;}
        if("import".equals(kind)){java.net.URI url=new java.net.URI(body.getString("sourceUrl"));if(!"https".equals(url.getScheme())||url.getHost()==null||url.getUserInfo()!=null||body.getString("sourceUrl").length()>2048)return false;}
      }catch(Exception invalid){return false;}
      final long token=epoch;final JSONObject payload=body;providerNetwork.execute(()->{int status=503;JSONObject response=new JSONObject();try{
        String credential=null;if(!"capabilities".equals(kind)){FirebaseUser current=auth.getCurrentUser();if(current==null||!account.equals(current.getUid()))return;credential=com.google.android.gms.tasks.Tasks.await(current.getIdToken(false),20,java.util.concurrent.TimeUnit.SECONDS).getToken();}
        java.net.URL url=new java.net.URL("https://usspace-notify-cb2f5cbc.floot.app/_api/usspace-travel/"+kind);java.net.HttpURLConnection connection=(java.net.HttpURLConnection)url.openConnection();try{connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(25000);connection.setRequestMethod("capabilities".equals(kind)?"GET":"POST");connection.setRequestProperty("Accept","application/json");if(credential!=null)connection.setRequestProperty("Authorization","Bearer "+credential);if(!"capabilities".equals(kind)){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");try(java.io.OutputStream out=connection.getOutputStream()){out.write(payload.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}}
          status=connection.getResponseCode();java.io.InputStream stream=status>=200&&status<300?connection.getInputStream():connection.getErrorStream();java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();if(stream!=null)try(java.io.InputStream input=stream){byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1){if(bytes.size()+n>196608)throw new IllegalStateException("Response too large");bytes.write(buffer,0,n);}}response=new JSONObject(bytes.toString("UTF-8"));
        }finally{connection.disconnect();}
      }catch(Exception unavailable){status=503;response=new JSONObject();}
      final int resultStatus=status;final JSONObject result=response;activity.runOnUiThread(()->{if(closed||epoch!=token||!account.equals(uid)||auth.getCurrentUser()!=null&&!account.equals(auth.getCurrentUser().getUid()))return;try{JSONObject event=new JSONObject();event.put("uid",account);event.put("requestId",requestId);event.put("kind",kind);event.put("status",resultStatus);event.put("body",result);view.evaluateJavascript("window.onUsTravelProviderResult&&window.onUsTravelProviderResult("+event+");",null);}catch(Exception ignored){}});
      });return true;
    }
    @JavascriptInterface public void refresh(){activity.runOnUiThread(()->{observeAuth();error="";post();drain();});}
    public void onPageReady(){pageReady=true;refresh();}
    private static Object json(Object value)throws Exception{if(value==null)return JSONObject.NULL;if(value instanceof Timestamp)return ((Timestamp)value).toDate().toInstant().toString();if(value instanceof Map){JSONObject o=new JSONObject();for(Map.Entry<?,?>e:((Map<?,?>)value).entrySet())o.put(String.valueOf(e.getKey()),json(e.getValue()));return o;}if(value instanceof List){JSONArray a=new JSONArray();for(Object x:(List<?>)value)a.put(json(x));return a;}return value;}
    private void post(){if(!pageReady||closed)return;try{JSONObject state=new JSONObject();state.put("uid",uid);state.put("pairId",ready?pair:"");state.put("sharedReady",ready);state.put("error",error);state.put("sending",sending);List<Map<String,Object>> visible=new ArrayList<>();for(Map<String,Object> value:records.values()){Map<String,Object> copy=new HashMap<>(value);if("photo".equals(copy.get("_kind")))copy.remove("data");visible.add(copy);}state.put("records",json(visible));state.put("reactions",json(new ArrayList<>(reactions.values())));JSONArray pending=uid.isEmpty()?new JSONArray():new JSONArray(queue().toString());for(int i=0;i<pending.length();i++){JSONArray changes=pending.getJSONObject(i).getJSONArray("changes");for(int n=0;n<changes.length();n++)changes.getJSONObject(n).getJSONObject("fields").remove("data");}JSONArray waiting=new JSONArray(),acknowledged=new JSONArray();for(int i=0;i<pending.length();i++){JSONObject op=pending.getJSONObject(i);if(op.optBoolean("acknowledged"))acknowledged.put(op);else waiting.put(op);}state.put("pending",waiting);state.put("acknowledged",acknowledged);String script="window.onUsTravelState&&window.onUsTravelState("+state+");";view.evaluateJavascript(script,null);}catch(Exception ignored){}}
    public void close(){closed=true;epoch++;providerNetwork.shutdownNow();handler.removeCallbacksAndMessages(null);auth.removeAuthStateListener(authListener);detach(privateListeners);clearShared();if(userListener!=null)userListener.remove();records.clear();reactions.clear();}
}
