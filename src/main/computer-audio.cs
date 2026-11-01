using System;
using System.Runtime.InteropServices;
public static class UncleAudio {
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator {}
 [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Devices {
  int EnumAudioEndpoints(int flow,int state,out IntPtr devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out Device device);
 }
 [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Device {
  [PreserveSig] int Activate(ref Guid id,int context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)]out object result);
 }
 [ComImport,Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Volume {
  [PreserveSig] int RegisterControlChangeNotify(IntPtr p);[PreserveSig] int UnregisterControlChangeNotify(IntPtr p);[PreserveSig] int GetChannelCount(out uint count);
  [PreserveSig] int SetMasterVolumeLevel(float value,Guid context);[PreserveSig] int SetMasterVolumeLevelScalar(float value,Guid context);
  [PreserveSig] int GetMasterVolumeLevel(out float value);[PreserveSig] int GetMasterVolumeLevelScalar(out float value);
  [PreserveSig] int SetChannelVolumeLevel(uint channel,float value,Guid context);[PreserveSig] int SetChannelVolumeLevelScalar(uint channel,float value,Guid context);
  [PreserveSig] int GetChannelVolumeLevel(uint channel,out float value);[PreserveSig] int GetChannelVolumeLevelScalar(uint channel,out float value);
  [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)]bool mute,Guid context);[PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)]out bool mute);
 }
 public static object Apply(string action,double level) {
  Devices devices=(Devices)new Enumerator();Device device=null;object instance=null;
  try {Marshal.ThrowExceptionForHR(devices.GetDefaultAudioEndpoint(0,1,out device));Guid id=typeof(Volume).GUID;Marshal.ThrowExceptionForHR(device.Activate(ref id,23,IntPtr.Zero,out instance));Volume endpoint=(Volume)instance;float current;bool muted;Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out current));
   if(action=="volume_set"||action=="volume_up"||action=="volume_down") {double next=action=="volume_set"?level:current*100+(action=="volume_up"?1:-1)*(level>0?level:10);Marshal.ThrowExceptionForHR(endpoint.SetMasterVolumeLevelScalar((float)(Math.Max(0,Math.Min(100,next))/100),Guid.Empty));if(next>0 && action!="volume_down")Marshal.ThrowExceptionForHR(endpoint.SetMute(false,Guid.Empty));}
   else if(action=="mute"||action=="unmute"){if(action=="unmute" && current<=0)Marshal.ThrowExceptionForHR(endpoint.SetMasterVolumeLevelScalar(0.25f,Guid.Empty));Marshal.ThrowExceptionForHR(endpoint.SetMute(action=="mute",Guid.Empty));}
   else if(action!="status")throw new Exception("Unknown audio action");
   Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out current));Marshal.ThrowExceptionForHR(endpoint.GetMute(out muted));return new{level=Math.Round(current*100),muted=muted};
  }finally{if(instance!=null)Marshal.ReleaseComObject(instance);if(device!=null)Marshal.ReleaseComObject(device);Marshal.ReleaseComObject(devices);}
 }
}
