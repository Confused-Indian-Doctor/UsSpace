import java.util.List;
import java.util.Map;
import java.util.Set;
import app.usspace.couple.v012.TravelQueuePolicy;
public final class TravelQueuePolicyTest {
 static int checks;static void equal(Set<String> actual,Set<String> expected){checks++;if(!actual.equals(expected))throw new AssertionError(actual+" != "+expected);}
 public static void main(String[] args){
  equal(TravelQueuePolicy.descendants("create",Map.of("create",List.of(),"edit",List.of("create"),"move",List.of("edit"),"other",List.of())),Set.of("create","edit","move"));
  equal(TravelQueuePolicy.descendants("unpaired",Map.of("unpaired",List.of(),"private-dependent",List.of("unpaired"),"private-independent",List.of())),Set.of("unpaired","private-dependent"));
  equal(TravelQueuePolicy.descendants("a",Map.of("a",List.of("b"),"b",List.of("a"))),Set.of("a","b"));
  equal(TravelQueuePolicy.descendants("a",Map.of("a",List.of(),"b",List.of("a","a"),"c",List.of("b","a"))),Set.of("a","b","c"));
  equal(TravelQueuePolicy.descendants("missing",Map.of("a",List.of())),Set.of("missing"));
  for(String[] scope:new String[][]{{"al","al","al"}}){checks++;if(!TravelQueuePolicy.actor(scope[0],scope[1],scope[2]))throw new AssertionError("valid actor rejected");}
  for(String[] scope:new String[][]{{"al","al","yashika"},{"al","yashika","yashika"},{"","",""},{null,"al","al"},{"al","al",""}}){checks++;if(TravelQueuePolicy.actor(scope[0],scope[1],scope[2]))throw new AssertionError("stale or missing actor accepted");}
  System.out.println("TRAVEL_QUEUE_POLICY_TEST_OK ("+checks+" dependency cascade, account/pair and cycle cases)");
 }
}
