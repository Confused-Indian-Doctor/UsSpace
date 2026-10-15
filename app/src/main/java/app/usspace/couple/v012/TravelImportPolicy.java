package app.usspace.couple.v012;

import java.util.Arrays;

/** Pure boundaries used by the real Android share receiver. */
public final class TravelImportPolicy {
    public static final int MAX_IMAGE_BYTES=12*1024*1024, MAX_TEXT=12000, MAX_JOBS=10;
    private TravelImportPolicy(){}
    public static boolean text(String value){return value!=null&&!value.trim().isEmpty()&&value.length()<=MAX_TEXT;}
    public static boolean imageMime(String value){return Arrays.asList("image/jpeg","image/png","image/webp").contains(value);}
    public static boolean dimensions(int width,int height,long maximum){return width>0&&height>0&&(long)width*height<=maximum;}
    public static boolean header(byte[] data,String mime){if(data==null||!imageMime(mime))return false;
      if("image/jpeg".equals(mime))return data.length>=3&&(data[0]&255)==255&&(data[1]&255)==216&&(data[2]&255)==255;
      if("image/png".equals(mime)){int[] signature={137,80,78,71,13,10,26,10};if(data.length<8)return false;for(int i=0;i<8;i++)if((data[i]&255)!=signature[i])return false;return true;}
      return data.length>=12&&data[0]==82&&data[1]==73&&data[2]==70&&data[3]==70&&data[8]==87&&data[9]==69&&data[10]==66&&data[11]==80;
    }
    public static boolean duplicate(String previousOwner,String owner,String previousFingerprint,String fingerprint){return fingerprint!=null&&fingerprint.equals(previousFingerprint)&&(owner!=null&&owner.equals(previousOwner)||"".equals(previousOwner));}
    public static boolean visible(String owner,String currentUid){return owner!=null&&("".equals(owner)||owner.equals(currentUid));}
}
