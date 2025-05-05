import axios from "axios";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import React, { SetStateAction, useState } from "react";
import { Alert, StyleSheet, TouchableOpacity } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";

const ASSEMBLYAI_API_KEY = "121ab7c8155345448e02c34098111573";

export default function Transtext({
    setText,
}: {
    text: string;
    setText: React.Dispatch<SetStateAction<string>>;
}) {
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [uri, setUri] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);

    const startRecording = async () => {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== "granted") {
                Alert.alert("Không có quyền ghi âm");
                return;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                playThroughEarpieceAndroid: false,
            });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

            setRecording(recording);
            setUri(null);
            setIsRecording(true);
        } catch (err) {
            console.error("Lỗi khi bắt đầu ghi âm", err);
        }
    };

    const stopRecording = async () => {
        try {
            await recording?.stopAndUnloadAsync();
            const recordedUri = recording?.getURI();
            setRecording(null);
            setIsRecording(false);
            setUri(recordedUri || null);

            await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

            if (recordedUri) {
                console.log("🎤 Ghi âm tại:", recordedUri);
                const uploadUrl = await uploadAudioToAssemblyAI(recordedUri);
                const response = await axios.post(
                    "https://transtext-zeta.vercel.app/convert",
                    {
                        audio: uploadUrl,
                    }
                );
                setText(response.data.text);
            }
        } catch (err) {
            console.error("Lỗi khi dừng ghi âm", err);
        }
    };

    const uploadAudioToAssemblyAI = async (
        fileUri: string
    ): Promise<string> => {
        try {
            const uploadResult = await FileSystem.uploadAsync(
                "https://api.assemblyai.com/v2/upload",
                fileUri,
                {
                    httpMethod: "POST",
                    headers: {
                        authorization: ASSEMBLYAI_API_KEY,
                        "Content-Type": "application/octet-stream",
                    },
                    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                }
            );

            const data = JSON.parse(uploadResult.body);
            if (!data.upload_url) {
                throw new Error(`Unexpected response: ${uploadResult.body}`);
            }
            return data.upload_url;
        } catch (err) {
            console.error("Error uploading audio:", err);
            throw new Error("Failed to upload audio");
        }
    };

    const handleMicPress = () => {
        const newListeningState = !isRecording;
        if (newListeningState) {
            startRecording();
        } else {
            stopRecording();
        }
    };

    return (
        <TouchableOpacity style={styles.micButton} onPress={handleMicPress}>
            <Icon
                name={isRecording ? "mic-off" : "mic"}
                size={24}
                color={isRecording ? "#D32F2F" : "#4285F4"}
            />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    micButton: {
        padding: 8,
    },
});
