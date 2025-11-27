if(NOT TARGET ReactAndroid::hermestooling)
add_library(ReactAndroid::hermestooling SHARED IMPORTED)
set_target_properties(ReactAndroid::hermestooling PROPERTIES
    IMPORTED_LOCATION "/Users/kumar4892/.gradle/caches/8.14.3/transforms/64154565a47eb8a1dc75210fa17f6969/transformed/react-android-0.81.1-release/prefab/modules/hermestooling/libs/android.arm64-v8a/libhermestooling.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/kumar4892/.gradle/caches/8.14.3/transforms/64154565a47eb8a1dc75210fa17f6969/transformed/react-android-0.81.1-release/prefab/modules/hermestooling/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::jsi)
add_library(ReactAndroid::jsi SHARED IMPORTED)
set_target_properties(ReactAndroid::jsi PROPERTIES
    IMPORTED_LOCATION "/Users/kumar4892/.gradle/caches/8.14.3/transforms/64154565a47eb8a1dc75210fa17f6969/transformed/react-android-0.81.1-release/prefab/modules/jsi/libs/android.arm64-v8a/libjsi.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/kumar4892/.gradle/caches/8.14.3/transforms/64154565a47eb8a1dc75210fa17f6969/transformed/react-android-0.81.1-release/prefab/modules/jsi/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::reactnative)
add_library(ReactAndroid::reactnative SHARED IMPORTED)
set_target_properties(ReactAndroid::reactnative PROPERTIES
    IMPORTED_LOCATION "/Users/kumar4892/.gradle/caches/8.14.3/transforms/64154565a47eb8a1dc75210fa17f6969/transformed/react-android-0.81.1-release/prefab/modules/reactnative/libs/android.arm64-v8a/libreactnative.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/kumar4892/.gradle/caches/8.14.3/transforms/64154565a47eb8a1dc75210fa17f6969/transformed/react-android-0.81.1-release/prefab/modules/reactnative/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

