import app.usspace.couple.v012.TravelImportPolicy;
public final class TravelImportPolicyTest {
  static int checks;static void check(boolean value){checks++;if(!value)throw new AssertionError("Travel import policy check "+checks);}
  public static void main(String[] args){
    check(TravelImportPolicy.text("https://maps.example/place"));check(!TravelImportPolicy.text(null));check(!TravelImportPolicy.text("  \n"));check(TravelImportPolicy.text("x".repeat(12000)));check(!TravelImportPolicy.text("x".repeat(12001)));
    for(String mime:new String[]{"image/jpeg","image/png","image/webp"})check(TravelImportPolicy.imageMime(mime));for(String mime:new String[]{null,"text/html","image/svg+xml","application/octet-stream","image/*"})check(!TravelImportPolicy.imageMime(mime));
    byte[] png={(byte)137,80,78,71,13,10,26,10};byte[] jpeg={(byte)255,(byte)216,(byte)255};byte[] webp={82,73,70,70,0,0,0,0,87,69,66,80};
    check(TravelImportPolicy.header(png,"image/png"));check(TravelImportPolicy.header(jpeg,"image/jpeg"));check(TravelImportPolicy.header(webp,"image/webp"));check(!TravelImportPolicy.header(png,"image/jpeg"));check(!TravelImportPolicy.header(jpeg,"image/png"));check(!TravelImportPolicy.header(null,"image/jpeg"));check(!TravelImportPolicy.header(new byte[2],"image/jpeg"));check(!TravelImportPolicy.header(new byte[]{(byte)137,80,78,71},"image/png"));
    check(TravelImportPolicy.dimensions(1000,1000,40000000));check(TravelImportPolicy.dimensions(8000,5000,40000000));check(!TravelImportPolicy.dimensions(8001,5000,40000000));check(!TravelImportPolicy.dimensions(Integer.MAX_VALUE,Integer.MAX_VALUE,40000000));check(!TravelImportPolicy.dimensions(0,100,40000000));check(!TravelImportPolicy.dimensions(-1,100,40000000));
    check(TravelImportPolicy.duplicate("al","al","hash","hash"));check(TravelImportPolicy.duplicate("","al","hash","hash"));check(!TravelImportPolicy.duplicate("al","yashika","hash","hash"));check(!TravelImportPolicy.duplicate("al","al","other","hash"));
    check(TravelImportPolicy.visible("","al"));check(TravelImportPolicy.visible("al","al"));check(!TravelImportPolicy.visible("al","yashika"));check(!TravelImportPolicy.visible("al",""));check(TravelImportPolicy.MAX_IMAGE_BYTES==12582912);check(TravelImportPolicy.MAX_JOBS==10);
    System.out.println("TRAVEL_IMPORT_POLICY_TEST_OK ("+checks+" MIME, header, dimensions, account and duplicate boundaries)");
  }
}
