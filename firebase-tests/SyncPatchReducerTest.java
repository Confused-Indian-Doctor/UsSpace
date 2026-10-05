package app.usspace.couple.v012;
import java.util.*;
public final class SyncPatchReducerTest {
    static Map<String,Object> m(Object... pairs){Map<String,Object> out=new LinkedHashMap<>();for(int i=0;i<pairs.length;i+=2)out.put((String)pairs[i],pairs[i+1]);return out;}
    static Map<String,Object> patch(Map<String,Object>... operations){return m("changes",Arrays.asList(operations));}
    static Map<String,Object> op(String kind,List<String> path,Object value){return m("kind",kind,"path",path,"value",value);}
    static Map<String,Object> at(Map<String,Object> root,String... path){Map<String,Object> node=root;for(String key:path)node=(Map<String,Object>)node.get(key);return node;}
    static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    public static void main(String[] args){
        List<String> alXp=Arrays.asList("learn","progress","al","xp"),yaXp=Arrays.asList("learn","progress","yashika","xp"),cards=Arrays.asList("learn","progress","al","cards"),units=Arrays.asList("learn","progress","al","units");
        Map<String,Object> cloud=m("goals",Arrays.asList(m("id","goal","level","Visible","value",2,"target",20)),"health",m("note","HEALTH_SECRET"));
        Map<String,Object> a=patch(op("increment",alXp,2),m("kind","entity","path",Arrays.asList("goals"),"id","goal","increments",m("value",1))),b=patch(op("increment",alXp,3),op("increment",yaXp,5),m("kind","entity","path",Arrays.asList("goals"),"id","goal","increments",m("value",1)));
        Map<String,Object> merged=SyncPatchReducer.applyPatch(SyncPatchReducer.applyPatch(cloud,a),b);
        check(((Number)at(merged,"learn","progress","al").get("xp")).intValue()==5,"same learner increments lost");check(((Number)at(merged,"learn","progress","yashika").get("xp")).intValue()==5,"other learner overwritten");check(((Number)((Map<?,?>)((List<?>)merged.get("goals")).get(0)).get("value")).intValue()==4,"shared goal increments lost");check(!merged.containsKey("health"),"private health projected");
        Map<String,Object> early=patch(m("kind","latestMap","path",cards,"key","kn01","value",m("lastReviewed",100,"reps",1))),late=patch(m("kind","latestMap","path",cards,"key","kn01","value",m("lastReviewed",100,"reps",2)));
        check(SyncPatchReducer.applyPatch(SyncPatchReducer.applyPatch(m(),early),late).equals(SyncPatchReducer.applyPatch(SyncPatchReducer.applyPatch(m(),late),early)),"timestamp tie is order dependent");
        Map<String,Object> bonus=patch(m("kind","latestMap","path",units,"key","basics","value",m("completedAt",100,"score",100)));
        check(((Number)at(SyncPatchReducer.applyPatch(SyncPatchReducer.applyPatch(m(),bonus),bonus),"learn","progress","al").get("xp")).intValue()==30,"unit bonus duplicated");
        Map<String,Object> active=m("learn",m("progress",m("al",m("streak",5,"lastActive","2026-10-01"))));Map<String,Object> activity=patch(op("activity",Arrays.asList("learn","progress","al","lastActive"),m("day","2026-10-10","streak",1)));check(((Number)at(SyncPatchReducer.applyPatch(active,activity),"learn","progress","al").get("streak")).intValue()==1,"streak failed to reset after gap");
        Map<String,Object> attack=patch(m("kind","set","path",Arrays.asList("cycle"),"value",m("note","SECRET")),m("kind","latestMap","path",cards,"key","__proto__","value",m("lastReviewed",100,"reps",2)),m("kind","entity","path",Arrays.asList("goals"),"id","secret","fields",m("level","Private","title","SECRET")),op("set",alXp,m("health","SECRET")));
        check(!SyncPatchReducer.applyPatch(m(),attack).toString().contains("SECRET"),"malicious payload admitted");check(!SyncPatchReducer.applyPatch(m(),attack).toString().contains("__proto__"),"unsafe map key admitted");
        Map<String,Object> profile=SyncPatchReducer.projectProfile(m("health",m("note","SECRET"),"name","Me","life",m("watchTitle","Show","health",m("note","SECRET")),"checkins",Collections.emptyList()));check(!profile.toString().contains("SECRET"),"private profile payload admitted");
        System.out.println("NATIVE_SYNC_REDUCER_TEST_OK (production Java reducer concurrency, progress and privacy)");
    }
}
