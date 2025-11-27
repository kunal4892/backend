if(NOT TARGET ReactAndroid::hermestooling)
add_library(ReactAndroid::hermestooling SHARED IMPORTED)
set_target_properties(ReactAndroid::hermestooling PROPERTIES
    IMPORTED_LOCATION "/Users/kumar4892/.gradle/caches/8.14.3/transforms/5c3f1a51ec66dcb77e26df5751d043f4/transformed/react-android-0.81.1-debug/prefab/modules/hermestooling/libs/android.armeabi-v7a/libhermestooling.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/kumar4892/.gradle/caches/8.14.3/transforms/5c3f1a51ec66dcb77e26df5751d043f4/transformed/react-android-0.81.1-debug/prefab/modules/hermestooling/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::jsi)
add_library(ReactAndroid::jsi SHARED IMPORTED)
set_target_properties(ReactAndroid::jsi PROPERTIES
    IMPORTED_LOCATION "/Users/kumar4892/.gradle/caches/8.14.3/transforms/5c3f1a51ec66dcb77e26df5751d043f4/transformed/react-android-0.81.1-debug/prefab/modules/jsi/libs/android.armeabi-v7a/libjsi.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/kumar4892/.gradle/caches/8.14.3/transforms/5c3f1a51ec66dcb77e26df5751d043f4/transformed/react-android-0.81.1-debug/prefab/modules/jsi/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::reactnative)
add_library(ReactAndroid::reactnative SHARED IMPORTED)
set_target_properties(ReactAndroid::reactnative PROPERTIES
    IMPORTED_LOCATION "/Users/kumar4892/.gradle/caches/8.14.3/transforms/5c3f1a51ec66dcb77e26df5751d043f4/transformed/react-android-0.81.1-debug/prefab/modules/reactnative/libs/android.armeabi-v7a/libreactnative.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/kumar4892/.gradle/caches/8.14.3/transforms/5c3f1a51ec66dcb77e26df5751d043f4/transformed/react-android-0.81.1-debug/prefab/modules/reactnative/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

