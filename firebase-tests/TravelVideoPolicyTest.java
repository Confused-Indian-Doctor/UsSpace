package app.usspace.couple.v012;
public class TravelVideoPolicyTest {
 public static void main(String[] args){
  byte[] mp4={0,0,0,24,'f','t','y','p','i','s','o','m'};
  check(TravelImportPolicy.videoHeader(mp4));mp4[4]='X';check(!TravelImportPolicy.videoHeader(mp4));check(!TravelImportPolicy.videoHeader(new byte[8]));check(!TravelImportPolicy.videoHeader(null));
  check(TravelImportPolicy.videoBounds(1920,1080,120000));check(TravelImportPolicy.videoBounds(1080,1920,1));
  check(!TravelImportPolicy.videoBounds(1920,1080,120001));check(!TravelImportPolicy.videoBounds(0,1080,100));check(!TravelImportPolicy.videoBounds(1920,1080,0));check(!TravelImportPolicy.videoBounds(4000,2000,100));check(!TravelImportPolicy.videoBounds(Integer.MAX_VALUE,Integer.MAX_VALUE,100));
  System.out.println("11 video boundary assertions passed (pure policy, not codec/device proof)");
 }
 static void check(boolean yes){if(!yes)throw new AssertionError();}
}
