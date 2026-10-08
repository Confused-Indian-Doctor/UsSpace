package app.usspace.couple.v012;

import java.util.*;

/** Pure transaction reducer shared by every native realtime write. No private state accepted. */
public final class SyncPatchReducer {
    private static final Map<String, List<String>> ITEMS = new LinkedHashMap<>();
    private static final Map<String, List<String>> PROGRESS_MAPS = new LinkedHashMap<>();
    private static final List<String> PROGRESS = Arrays.asList("v", "known", "xp", "attempts", "correct", "streak", "lastActive", "cards", "units", "sessions", "dailyGoal");
    static {
        ITEMS.put("duties", Arrays.asList("id", "owner", "date", "type", "time", "title", "place"));
        ITEMS.put("goals", Arrays.asList("id", "title", "value", "target", "unit", "level"));
        ITEMS.put("notes", Arrays.asList("id", "text", "date", "kind"));
        ITEMS.put("memories", Arrays.asList("id", "title", "date", "place", "text", "emoji", "photoId"));
        PROGRESS_MAPS.put("cards", Arrays.asList("reps", "interval", "due", "ease", "lapses", "lastReviewed"));
        PROGRESS_MAPS.put("units", Arrays.asList("completedAt", "score"));
        PROGRESS_MAPS.put("sessions", Arrays.asList("day", "at", "xp", "attempts", "correct"));
    }
    private SyncPatchReducer() { }
    @SuppressWarnings("unchecked") private static Map<String, Object> map(Object v) { return v instanceof Map ? (Map<String, Object>)v : new LinkedHashMap<>(); }
    private static List<?> list(Object v) { return v instanceof List ? (List<?>)v : Collections.emptyList(); }
    private static Object copy(Object v) { if(v instanceof Map){Map<String,Object> o=new LinkedHashMap<>();for(Map.Entry<String,Object> e:map(v).entrySet())o.put(e.getKey(),copy(e.getValue()));return o;}if(v instanceof List){List<Object> o=new ArrayList<>();for(Object x:list(v))o.add(copy(x));return o;}return v; }
    private static Map<String,Object> select(Object v, List<String> keys) { Map<String,Object> source=map(v), out=new LinkedHashMap<>();for(String k:keys)if(source.containsKey(k)&&scalar(source.get(k)))out.put(k,copy(source.get(k)));return out; }
    private static boolean scalar(Object v) { return v==null||v instanceof String||v instanceof Boolean||(v instanceof Number&&Double.isFinite(((Number)v).doubleValue())); }
    private static boolean safeKey(String k) { return k.length()<160&&!Arrays.asList("__proto__","prototype","constructor").contains(k); }
    private static String rank(Map<String,Object> v,List<String> keys){List<String> sorted=new ArrayList<>(keys);Collections.sort(sorted);StringBuilder out=new StringBuilder();for(String key:sorted){if(out.length()>0)out.append("\u001f");out.append(key).append(":").append(text(v.get(key)));}return out.toString();}
    private static double number(Object value) { return value instanceof Number?((Number)value).doubleValue():0d; }
    private static String text(Object value) { if(value==null)return "";if(value instanceof Number){double d=((Number)value).doubleValue();if(d==(long)d)return Long.toString((long)d);}return String.valueOf(value); }
    public static Map<String,Object> projectCommon(Map<String,Object> input) {
        Map<String,Object> out=new LinkedHashMap<>();out.put("visit",input.get("visit") instanceof String?input.get("visit"):"");
        for(String k:ITEMS.keySet()){List<Object> clean=new ArrayList<>();for(Object entry:list(input.get(k))){Map<String,Object> item=map(entry);if(!(item.get("id") instanceof String||item.get("id") instanceof Number)||("goals".equals(k)&&"Private".equals(item.get("level"))))continue;Map<String,Object> cleanItem=select(item,ITEMS.get(k));if("memories".equals(k)&&cleanItem.containsKey("photoId")){Object photo=cleanItem.get("photoId");if(!(photo instanceof String)||(!((String)photo).isEmpty()&&!((String)photo).matches("[A-Za-z0-9_-]{1,140}")))cleanItem.remove("photoId");}clean.add(cleanItem);if(clean.size()>=500)break;}out.put(k,clean);}
        Map<String,Object> progresses=new LinkedHashMap<>(), raw=map(map(input.get("learn")).get("progress"));
        for(String learner:Arrays.asList("al","yashika")){if(!raw.containsKey(learner))continue;Map<String,Object> progress=select(raw.get(learner),PROGRESS);for(String counter:Arrays.asList("v","xp","attempts","correct","streak","dailyGoal"))if(progress.containsKey(counter)&&!(progress.get(counter) instanceof Number))progress.remove(counter);for(String kind:PROGRESS_MAPS.keySet()){Map<String,Object> clean=new LinkedHashMap<>();for(Map.Entry<String,Object> e:map(map(raw.get(learner)).get(kind)).entrySet())if(safeKey(e.getKey()))clean.put(e.getKey(),select(e.getValue(),PROGRESS_MAPS.get(kind)));progress.put(kind,clean);}LinkedHashSet<String> known=new LinkedHashSet<>();for(Object id:list(map(raw.get(learner)).get("known")))if(id instanceof String&&((String)id).length()<160)known.add((String)id);progress.put("known",new ArrayList<>(known));progresses.put(learner,progress);}
        Map<String,Object> learn=new LinkedHashMap<>();learn.put("progress",progresses);out.put("learn",learn);return out;
    }
    public static Map<String,Object> projectProfile(Map<String,Object> input) {
        Map<String,Object> out=select(input,Arrays.asList("name","status","updated"));out.put("life",select(input.get("life"),Arrays.asList("watchTitle","watchType","watchDetail","exercise","exerciseDone","weekend","current","updated")));
        List<Object> clean=new ArrayList<>();for(Object entry:list(input.get("checkins"))){clean.add(select(entry,Arrays.asList("date","mood","day","smile","miss")));if(clean.size()==30)break;}out.put("checkins",clean);return out;
    }
    private static Object get(Map<String,Object> root,List<String> path){Object value=root;for(String key:path)value=map(value).get(key);return value;}
    private static void put(Map<String,Object> root,List<String> path,Object value){Map<String,Object> target=root;for(String key:path.subList(0,path.size()-1)){if(!(target.get(key) instanceof Map))target.put(key,new LinkedHashMap<String,Object>());target=map(target.get(key));}target.put(path.get(path.size()-1),copy(value));}
    private static boolean allowed(List<String> path){return path.size()==1&&"visit".equals(path.get(0))||path.size()==4&&"learn".equals(path.get(0))&&"progress".equals(path.get(1))&&Arrays.asList("al","yashika").contains(path.get(2))&&PROGRESS.contains(path.get(3));}
    public static Map<String,Object> applyPatch(Map<String,Object> payload,Map<String,Object> patch){
        Map<String,Object> out=projectCommon(payload);
        for(Object raw:list(patch.get("changes"))){Map<String,Object> op=map(raw);List<String> path=new ArrayList<>();for(Object key:list(op.get("path")))path.add(text(key));String kind=text(op.get("kind"));
            if("entity".equals(kind)&&path.size()==1&&ITEMS.containsKey(path.get(0))){String key=path.get(0);List<Object> entries=new ArrayList<>(list(out.get(key)));int at=-1;for(int i=0;i<entries.size();i++)if(text(map(entries.get(i)).get("id")).equals(text(op.get("id")))){at=i;break;}if(Boolean.TRUE.equals(op.get("remove"))){if(at>=0)entries.remove(at);out.put(key,entries);continue;}
                Map<String,Object> fields=select(op.get("fields"),ITEMS.get(key));if("goals".equals(key)&&"Private".equals(fields.get("level"))){if(at>=0)entries.remove(at);out.put(key,entries);continue;}Map<String,Object> value=at>=0?new LinkedHashMap<>(map(entries.get(at))):new LinkedHashMap<>();value.put("id",op.get("id"));value.putAll(fields);Object delta=map(op.get("increments")).get("value");if("goals".equals(key)&&delta instanceof Number){double max=number(value.get("target"));value.put("value",Math.max(0,Math.min(max>0?max:9007199254740991d,number(value.get("value"))+number(delta))));}if(at>=0)entries.set(at,value);else entries.add(0,value);out.put(key,entries);continue;
            }
            if(!allowed(path))continue;String field=path.get(path.size()-1);Object current=get(out,path), value=op.get("value");
            if("set".equals(kind)&&!Arrays.asList("cards","units","sessions","known").contains(field))put(out,path,value);
            else if("increment".equals(kind)&&Arrays.asList("xp","attempts","correct").contains(field)&&value instanceof Number)put(out,path,Math.max(0,number(current)+Math.max(0,number(value))));
            else if("union".equals(kind)&&"known".equals(field)){LinkedHashSet<Object> known=new LinkedHashSet<>(list(current));known.addAll(list(value));put(out,path,new ArrayList<>(known));}
            else if("activity".equals(kind)&&"lastActive".equals(field)&&map(value).get("day") instanceof String){String day=text(map(value).get("day")),old=text(current);List<String> streakPath=new ArrayList<>(path.subList(0,path.size()-1));streakPath.add("streak");double streak=number(get(out,streakPath)),incoming=number(map(value).get("streak"));long gap=Long.MAX_VALUE;try{gap=java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.parse(old),java.time.LocalDate.parse(day));}catch(Exception ignored){}if(day.compareTo(old)>=0){put(out,path,day);put(out,streakPath,day.equals(old)?Math.max(streak,incoming):gap==1?Math.max(streak+1,incoming):incoming);}}
            else if("max".equals(kind)&&Arrays.asList("streak","lastActive").contains(field)){boolean newer=current==null||("streak".equals(field)?number(value)>number(current):text(value).compareTo(text(current))>0);put(out,path,newer?value:current);}
            else if("latestMap".equals(kind)&&PROGRESS_MAPS.containsKey(field)&&op.get("key") instanceof String&&safeKey((String)op.get("key"))){Map<String,Object> clean=select(value,PROGRESS_MAPS.get(field)),prior=map(map(current).get(text(op.get("key"))));String stamp="cards".equals(field)?"lastReviewed":"units".equals(field)?"completedAt":"day";if(prior.isEmpty()||text(clean.get(stamp)).compareTo(text(prior.get(stamp)))>0||(text(clean.get(stamp)).equals(text(prior.get(stamp)))&&rank(clean,PROGRESS_MAPS.get(field)).compareTo(rank(prior,PROGRESS_MAPS.get(field)))>0)){if("units".equals(field)){if(prior.isEmpty()&&number(clean.get("completedAt"))>0&&number(clean.get("score"))>=80){List<String> xp=new ArrayList<>(path.subList(0,path.size()-1));xp.add("xp");put(out,xp,number(get(out,xp))+30);}clean.put("score",Math.max(number(prior.get("score")),number(clean.get("score"))));}List<String> nested=new ArrayList<>(path);nested.add(text(op.get("key")));put(out,nested,clean);}}
        }
        return projectCommon(out);
    }
}
