package com.tiwana56.procutstudio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ExportForegroundServicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
