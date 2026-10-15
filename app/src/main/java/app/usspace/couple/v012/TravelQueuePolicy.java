package app.usspace.couple.v012;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
/** Discarding a failed predecessor must not silently run edits based on it. */
public final class TravelQueuePolicy {
 private TravelQueuePolicy(){}
 public static Set<String> descendants(String root,Map<String,List<String>> dependencies){
  Set<String> removed=new HashSet<>();removed.add(root);boolean changed=true;
  while(changed){changed=false;for(Map.Entry<String,List<String>> e:dependencies.entrySet())if(!removed.contains(e.getKey()))for(String dependency:e.getValue())if(removed.contains(dependency)){removed.add(e.getKey());changed=true;break;}}
  return removed;
 }
}
