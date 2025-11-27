if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/Users/kumar4892/.gradle/caches/8.14.3/transforms/c9c069c67508f2a32b5d9ef0bfbb570c/transformed/hermes-android-0.81.1-release/prefab/modules/libhermes/libs/android.arm64-v8a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/kumar4892/.gradle/caches/8.14.3/transforms/c9c069c67508f2a32b5d9ef0bfbb570c/transformed/hermes-android-0.81.1-release/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

