import { GoogleGenerativeAI } from "@google/generative-ai";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { format } from "date-fns";
import { vi } from "date-fns/locale/vi";
import { Audio } from "expo-av";
import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Linking,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar, // Thêm import StatusBar
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import Icon from "react-native-vector-icons/MaterialIcons";
import Transtext from "../Components/Transtext";

interface Message {
    id: string;
    text: string;
    isUser: boolean;
    timestamp: Date;
    showMap?: boolean;
    locations?: {
        start: string;
        end: string;
    };
    isLoading?: boolean;
}

interface Location {
    latitude: number;
    longitude: number;
}

interface MapHistoryItem {
    id: string;
    startLocation: string;
    endLocation: string;
    timestamp: string;
}

interface GoogleAssistantChatProps {
    onSend?: (text: string) => void;
    onListeningStatusChange?: (isListening: boolean) => void;
    placeholder?: string;
    botName?: string;
    userName?: string;
    geminiApiKey?: string;
}

const GoogleAssistantChat: React.FC<GoogleAssistantChatProps> = ({
    onSend = () => {},
    onListeningStatusChange = () => {},
    placeholder = "Hỏi điều gì đó...",
    botName = "Assistant",
    userName = "Bạn",
    geminiApiKey = "AIzaSyCHIId7Q80cEF4PFDaJt6JwIG5EQuKUqvU", // Default API key, should be passed from outside
}) => {
    const [text, setText] = useState<string>("");
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "1",
            text: "Xin chào! Tôi có thể giúp gì cho bạn?",
            isUser: false,
            timestamp: new Date(),
        },
    ]);

    // State for map history
    const [mapHistory, setMapHistory] = useState<MapHistoryItem[]>([]);
    const [showHistory, setShowHistory] = useState<boolean>(false);

    // Initialize Gemini API client
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, setGenAI] = useState<any>(null);
    const [chatSession, setChatSession] = useState<any>(null);

    useEffect(() => {
        const setupGeminiAPI = async () => {
            try {
                const generativeAI = new GoogleGenerativeAI(geminiApiKey);
                const model = generativeAI.getGenerativeModel({
                    model: "gemini-1.5-flash",
                });

                const generationConfig = {
                    temperature: 1,
                    topP: 0.95,
                    topK: 64,
                    maxOutputTokens: 8192,
                    responseMimeType: "text/plain",
                };

                const session = model.startChat({
                    generationConfig,
                    history: [],
                });

                setGenAI(generativeAI);
                setChatSession(session);
            } catch (error) {
                console.error("Error setting up Gemini API:", error);
            }
        };

        setupGeminiAPI();
        loadMapHistory(); // Load saved map history when component mounts
    }, [geminiApiKey]);

    // Add ScrollView ref for auto-scrolling
    const scrollViewRef = useRef<ScrollView>(null);

    // Map related states
    const [mapData, setMapData] = useState<{
        messageId: string | null;
        startLocation: Location | null;
        endLocation: Location | null;
        route: Location[] | null;
        startName: string;
        endName: string;
    }>({
        messageId: null,
        startLocation: null,
        endLocation: null,
        route: null,
        startName: "Vị trí bắt đầu",
        endName: "Vị trí kết thúc",
    });

    useEffect(() => {
        const _fetch = async () => {
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        };
        _fetch();
    }, [text]);

    const speak = async (text: string) => {
        Speech.stop();

        Speech.speak(text, {
            language: "vi-VN",
            volume: 0.6,
        });
    };

    useEffect(() => {
        speak("Chào bạn, chúng tôi có thể giúp gì cho bạn?");
    }, []);

    // Add useEffect to auto-scroll when message list changes
    useEffect(() => {
        // Ensure scrollView is initialized and there are messages
        if (scrollViewRef.current && messages.length > 0) {
            // Add a small delay to ensure render completes before scrolling
            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages]);

    // Generate a random ID for messages
    const generateId = (): string => {
        return Math.random().toString(36).substring(2, 15);
    };

    const handleClear = (): void => {
        setText("");
    };

    const handleSend = (): void => {
        if (text.trim()) {
            speak("");

            // Add user message
            const userMessage: Message = {
                id: generateId(),
                text: text,
                isUser: true,
                timestamp: new Date(),
            };

            // Call callback if needed
            onSend(text);
            // Update state with new message
            setMessages((prevMessages) => [...prevMessages, userMessage]);

            // Process user message
            processUserMessage(text);

            // Clear input
            setText("");
        }
    };

    // Functions to save and load map history using AsyncStorage
    const saveMapHistory = async (newHistory: MapHistoryItem[]) => {
        try {
            await AsyncStorage.setItem(
                "mapHistory",
                JSON.stringify(newHistory)
            );
        } catch (error) {
            console.error("Error saving map history:", error);
        }
    };

    const loadMapHistory = async () => {
        try {
            const savedHistory = await AsyncStorage.getItem("mapHistory");
            if (savedHistory) {
                setMapHistory(JSON.parse(savedHistory));
            }
        } catch (error) {
            console.error("Error loading map history:", error);
        }
    };

    // Add a new search to history
    const addToMapHistory = (start: string, end: string) => {
        const newHistoryItem: MapHistoryItem = {
            id: generateId(),
            startLocation: start,
            endLocation: end,
            timestamp: new Date().toISOString(),
        };

        // Update history state (limit to 10 most recent)
        const updatedHistory = [newHistoryItem, ...mapHistory].slice(0, 10);
        setMapHistory(updatedHistory);

        // Save to AsyncStorage
        saveMapHistory(updatedHistory);
    };

    // Clear map history
    const clearMapHistory = () => {
        Alert.alert(
            "Xóa lịch sử",
            "Bạn có chắc chắn muốn xóa tất cả lịch sử tìm kiếm bản đồ?",
            [
                {
                    text: "Hủy",
                    style: "cancel",
                },
                {
                    text: "Xóa",
                    onPress: async () => {
                        setMapHistory([]);
                        await AsyncStorage.removeItem("mapHistory");
                        speak("Đã xóa lịch sử tìm kiếm bản đồ");
                    },
                    style: "destructive",
                },
            ]
        );
    };

    // Toggle map history panel
    const toggleMapHistory = () => {
        setShowHistory(!showHistory);
    };

    // Use a saved map search
    const handleHistoryItem = (item: MapHistoryItem) => {
        handleDirectionsRequest(
            `đường đi từ ${item.startLocation} đến ${item.endLocation}`
        );
        setShowHistory(false);
    };

    // Get coordinates from OpenStreetMap Nominatim API
    const getCoordinates = async (placeName: string) => {
        try {
            const url = `https://transtext-zeta.vercel.app/search?q=${placeName}`;
            const response = await axios.get(url);

            if (response.data && response.data.length > 0) {
                const { lat, lon } = response.data[0];
                return {
                    latitude: parseFloat(lat),
                    longitude: parseFloat(lon),
                };
            }
            return null;
        } catch (error) {
            console.error("Error fetching coordinates:", error);
            return null;
        }
    };

    const handleAlarmRequest = async (query: string) => {
        const alarmPattern =
            /(đặt|cài|hẹn|báo|set)\s+(báo thức|báo|alarm|thức dậy|thức giấc)\s+(lúc|vào|cho|at|for)?\s*(.+)/i;
        const match = query.match(alarmPattern);

        if (!match) return false;

        const timeString = match[4].trim();
        const parsedTime = parseTimeFromString(timeString);

        if (!parsedTime) {
            Alert.alert(
                "Lỗi",
                `Không hiểu định dạng thời gian "${timeString}". Thử lại với "7 giờ sáng" hoặc "3:45 chiều".`
            );
            return true;
        }

        const readableTime = format(parsedTime, "h:mm aaaa", { locale: vi });

        if (parsedTime < new Date()) {
            parsedTime.setDate(parsedTime.getDate() + 1);
        }

        try {
            if (Platform.OS === "android") {
                await setAndroidAlarm(parsedTime);
                Alert.alert(
                    "Thành công",
                    `Báo thức cho ${readableTime} đã được yêu cầu. Vui lòng xác nhận nếu ứng dụng đồng hồ mở ra.`
                );
            } else if (Platform.OS === "ios") {
                await setIOSAlarm(parsedTime);
            }

            await addAlarmToCalendar(parsedTime);
            await scheduleLocalNotification(parsedTime);

            console.log(`Đã đặt báo thức cho ${readableTime}`);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            Alert.alert("Lỗi", `Không thể đặt báo thức: ${errorMessage}`);
        }

        return true;
    };

    // Hàm phân tích chuỗi thời gian thành đối tượng Date
    const parseTimeFromString = (timeString: string): Date | null => {
        const now = new Date();
        let hours = 0;
        let minutes = 0;
        let isPM = false;

        // Xử lý "sáng", "chiều", "tối"
        if (
            timeString.includes("chiều") ||
            timeString.includes("tối") ||
            timeString.includes("pm") ||
            timeString.includes("PM")
        ) {
            isPM = true;
        }

        // Trích xuất giờ và phút từ chuỗi
        const hourPattern = /(\d{1,2})\s*(giờ|h|:|gi(ờ|o))/i;
        const minutePattern = /(\d{1,2})\s*(phút|p|ph(ú|u)t)/i;
        const combinedPattern = /(\d{1,2})[:\s](\d{1,2})/;

        // Kiểm tra mẫu kết hợp (vd: "7:30")
        const combinedMatch = timeString.match(combinedPattern);
        if (combinedMatch) {
            hours = parseInt(combinedMatch[1], 10);
            minutes = parseInt(combinedMatch[2], 10);
        } else {
            // Kiểm tra giờ và phút riêng biệt
            const hourMatch = timeString.match(hourPattern);
            if (hourMatch) {
                hours = parseInt(hourMatch[1], 10);
            }

            const minuteMatch = timeString.match(minutePattern);
            if (minuteMatch) {
                minutes = parseInt(minuteMatch[1], 10);
            }
        }

        // Xử lý AM/PM
        if (isPM && hours < 12) {
            hours += 12;
        }

        // Kiểm tra tính hợp lệ của thời gian
        if (
            isNaN(hours) ||
            hours < 0 ||
            hours > 23 ||
            isNaN(minutes) ||
            minutes < 0 ||
            minutes > 59
        ) {
            return null;
        }

        // Tạo đối tượng Date
        const alarmTime = new Date(now);
        alarmTime.setHours(hours);
        alarmTime.setMinutes(minutes);
        alarmTime.setSeconds(0);
        alarmTime.setMilliseconds(0);

        return alarmTime;
    };

    // Đặt báo thức trên Android thông qua Intent
    const setAndroidAlarm = async (time: Date) => {
        const hours = time.getHours();
        const minutes = time.getMinutes();

        // Định dạng URI cho Intent
        // Thử mở ứng dụng đồng hồ với Intent
        const clockAppUri = `android-app://com.android.deskclock/set_alarm?hour=${hours}&minutes=${minutes}&message=Báo thức&vibrate=true&skipUi=true`;

        if (await Linking.canOpenURL(clockAppUri)) {
            await Linking.openURL(clockAppUri);
        } else {
            // Phương pháp dự phòng: mở ứng dụng đồng hồ
            const clockAppIntent = `intent:#Intent;action=android.intent.action.SET_ALARM;component=com.android.deskclock/.AlarmClock;i.android.intent.extra.alarm.HOUR=${hours};i.android.intent.extra.alarm.MINUTES=${minutes};b.android.intent.extra.alarm.SKIP_UI=false;end`;

            if (await Linking.canOpenURL(clockAppIntent)) {
                await Linking.openURL(clockAppIntent);
            } else {
                // Mở ứng dụng đồng hồ mặc định
                const fallbackUri = `content://com.android.deskclock`;

                if (await Linking.canOpenURL(fallbackUri)) {
                    await Linking.openURL(fallbackUri);
                } else {
                    throw new Error("Không thể mở ứng dụng đồng hồ");
                }
            }
        }
    };

    // Đặt báo thức trên iOS
    const setIOSAlarm = async (time: Date) => {
        // Hiển thị hướng dẫn cho người dùng
        Alert.alert(
            "Tạo báo thức",
            `Vui lòng tạo báo thức cho ${format(
                time,
                "HH:mm"
            )} trong ứng dụng Đồng hồ.`,
            [{ text: "OK" }]
        );
    };

    // Thêm báo thức vào lịch như một sự kiện
    const addAlarmToCalendar = async (time: Date) => {
        try {
            // Yêu cầu quyền truy cập lịch
            const { status } = await Calendar.requestCalendarPermissionsAsync();

            if (status !== "granted") {
                throw new Error("Không có quyền truy cập lịch");
            }

            // Lấy lịch mặc định
            const calendars = await Calendar.getCalendarsAsync(
                Calendar.EntityTypes.EVENT
            );
            const defaultCalendar = calendars.find(
                (cal) =>
                    cal.allowsModifications &&
                    cal.source.type === Calendar.SourceType.LOCAL
            );

            if (!defaultCalendar) {
                throw new Error("Không tìm thấy lịch mặc định");
            }

            // Tạo sự kiện báo thức
            const eventId = await Calendar.createEventAsync(
                defaultCalendar.id,
                {
                    title: "Báo thức",
                    startDate: time,
                    endDate: new Date(time.getTime() + 5 * 60000), // Kéo dài 5 phút
                    alarms: [{ relativeOffset: 0 }], // Báo thức ngay tại thời điểm bắt đầu
                }
            );

            return eventId;
        } catch (error) {
            console.warn("Không thể thêm báo thức vào lịch:", error);
            // Tiếp tục với phương pháp khác
        }
    };

    // Lên lịch thông báo cục bộ
    const scheduleLocalNotification = async (time: Date) => {
        try {
            // Yêu cầu quyền thông báo
            const { status } = await Notifications.requestPermissionsAsync();

            if (status !== "granted") {
                throw new Error("Không có quyền gửi thông báo");
            }

            // Cấu hình thông báo
            await Notifications.setNotificationCategoryAsync("alarm", [
                {
                    identifier: "snooze",
                    buttonTitle: "Báo lại sau 5 phút",
                    options: {
                        isDestructive: false,
                        isAuthenticationRequired: false,
                    },
                },
                {
                    identifier: "dismiss",
                    buttonTitle: "Tắt báo thức",
                    options: {
                        isDestructive: true,
                        isAuthenticationRequired: false,
                    },
                },
            ]);

            // Tính toán thời gian để lên lịch
            const schedulingOptions = {
                content: {
                    title: "Báo thức",
                    body: "Đã đến giờ báo thức của bạn!",
                    sound: true,
                    priority: Notifications.AndroidNotificationPriority.MAX,
                    categoryIdentifier: "alarm",
                },
                trigger: {
                    date: time,
                },
            } as any;

            // Lên lịch thông báo
            const notificationId =
                await Notifications.scheduleNotificationAsync(
                    schedulingOptions
                );
            return notificationId;
        } catch (error) {
            console.warn("Không thể lên lịch thông báo:", error);
        }
    };

    // Decode polyline from OSRM API
    const decodePolyline = (encoded: string) => {
        const path: Location[] = [];
        let index = 0;
        const len = encoded.length;
        let lat = 0;
        let lng = 0;

        while (index < len) {
            let byte,
                shift = 0,
                result = 0;
            do {
                byte = encoded.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);
            const dLat = result & 1 ? ~(result >> 1) : result >> 1;
            lat += dLat;

            shift = 0;
            result = 0;
            do {
                byte = encoded.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);
            const dLng = result & 1 ? ~(result >> 1) : result >> 1;
            lng += dLng;

            path.push({
                latitude: lat / 1e5,
                longitude: lng / 1e5,
            });
        }
        return path;
    };

    // Find route from OSRM API
    const fetchRoute = async (start: Location, end: Location) => {
        const origin = `${start.longitude},${start.latitude}`;
        const destination = `${end.longitude},${end.latitude}`;

        try {
            const response = await axios.get(
                `http://router.project-osrm.org/route/v1/driving/${origin};${destination}?overview=full&geometries=polyline`
            );
            const polyline = response.data.routes[0].geometry;
            return decodePolyline(polyline);
        } catch (error) {
            console.error("Error fetching route:", error);
            return null;
        }
    };

    // Process "directions" messages from users
    const handleDirectionsRequest = async (userText: string) => {
        let startPlace = "Hồ Gươm, Hà Nội";
        let endPlace = "Ngã Tư Sở, Hà Nội";

        // Process message to extract locations
        const fromToPattern = /từ\s+(.+?)\s+đến\s+(.+)/i;
        const match = userText.match(fromToPattern);

        if (match) {
            startPlace = match[1].trim();
            endPlace = match[2].trim();
        }

        // Add to history
        addToMapHistory(startPlace, endPlace);

        // Create response message before map is available
        const messageId = generateId();
        const botResponse: Message = {
            id: messageId,
            text: `Đang tìm đường đi từ ${startPlace} đến ${endPlace}...`,
            isUser: false,
            timestamp: new Date(),
            showMap: true,
            locations: {
                start: startPlace,
                end: endPlace,
            },
        };

        setMessages((prevMessages) => [...prevMessages, botResponse]);

        // Get coordinates
        const startCoords = await getCoordinates(startPlace);
        const endCoords = await getCoordinates(endPlace);

        if (startCoords && endCoords) {
            // Update map information
            setMapData({
                messageId,
                startLocation: startCoords,
                endLocation: endCoords,
                route: null, // Will update after getting route
                startName: startPlace,
                endName: endPlace,
            });

            // Get route
            const routeData = await fetchRoute(startCoords, endCoords);
            if (routeData) {
                setMapData((prev) => ({
                    ...prev,
                    route: routeData,
                }));

                // Update message with more detailed information
                setMessages((prevMessages) =>
                    prevMessages.map((msg) =>
                        msg.id === messageId
                            ? {
                                  ...msg,
                                  text: `Đường đi từ ${startPlace} đến ${endPlace} (khoảng ${calculateDistance(
                                      routeData
                                  )} km)`,
                              }
                            : msg
                    )
                );

                speak(`Đã tìm thấy đường đi từ ${startPlace} đến ${endPlace}`);
            }
        } else {
            // Update message if location not found
            setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                    msg.id === messageId
                        ? {
                              ...msg,
                              text: `Không thể tìm thấy địa điểm ${
                                  !startCoords ? startPlace : endPlace
                              }`,
                              showMap: false,
                          }
                        : msg
                )
            );

            speak(
                `Không thể tìm thấy địa điểm ${
                    !startCoords ? startPlace : endPlace
                }`
            );
        }
    };

    // Calculate distance based on route
    const calculateDistance = (route: Location[]) => {
        if (!route || route.length < 2) return 0;

        let distance = 0;
        for (let i = 0; i < route.length - 1; i++) {
            distance += getDistanceBetweenPoints(route[i], route[i + 1]);
        }

        return Math.round(distance * 10) / 10; // Round to 1 decimal place
    };

    // Calculate distance between 2 points (Haversine formula)
    const getDistanceBetweenPoints = (start: Location, end: Location) => {
        const R = 6371; // Earth radius (km)
        const dLat = toRad(end.latitude - start.latitude);
        const dLon = toRad(end.longitude - start.longitude);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(start.latitude)) *
                Math.cos(toRad(end.latitude)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const toRad = (value: number) => {
        return (value * Math.PI) / 180;
    };

    // Open Google Maps outside the app
    const openGoogleMaps = (startAddress: string, endAddress: string) => {
        const url = Platform.select({
            ios: `comgooglemaps://?saddr=${encodeURIComponent( // saddr: start address
                startAddress
            )}&daddr=${encodeURIComponent( // daddr: destination address
                endAddress
            )}&directionsmode=walking`, // Thêm directionsmode=walking
            android: `google.navigation:q=${encodeURIComponent(
                endAddress
            )}&saddr=${encodeURIComponent(startAddress)}&mode=w`, // Thêm mode=w (walking)
        });

        Linking.openURL(url!).catch((err) => {
            console.error("Cannot open Google Maps", err);
            const fallbackUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
                startAddress
            )}&destination=${encodeURIComponent(endAddress)}&travelmode=walking`; // Thêm travelmode=walking
            Linking.openURL(fallbackUrl);
        });
    };

    // NEW FUNCTION: Handle Google Search
    const handleGoogleSearch = (query: string) => {
        const searchTerm = extractSearchQuery(query);
        if (!searchTerm) return false;

        // Create a response message
        const botResponse: Message = {
            id: generateId(),
            text: `Đang mở Google tìm kiếm "${searchTerm}"...`,
            isUser: false,
            timestamp: new Date(),
        };

        setMessages((prevMessages) => [...prevMessages, botResponse]);

        // Open Google search in browser
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
            searchTerm
        )}`;
        Linking.openURL(searchUrl);

        speak(`Đang mở Google tìm kiếm ${searchTerm}`);
        return true;
    };

    // NEW FUNCTION: Handle YouTube search and open
    const handleYouTubeRequest = async (query: string) => {
        const youtubePattern =
            /(mở|tìm|phát|nghe|xem)\s+(bài hát|video|nhạc|youtube|clip)\s+(.+)/i;
        const match = query.match(youtubePattern);

        if (!match) return false;

        const searchTerm = match[3].trim();

        // Create a response message
        const botResponse: Message = {
            id: generateId(),
            text: `Đang mở video "${searchTerm}" trên YouTube...`,
            isUser: false,
            timestamp: new Date(),
        };

        setMessages((prevMessages) => [...prevMessages, botResponse]);

        // Phương pháp 1: Mở trực tiếp video với mục đích tự động phát
        const youtubeVideoDirectUrl = `youtube://www.youtube.com/results?search_query=${encodeURIComponent(
            searchTerm
        )}&autoplay=1`;

        // Phương pháp 2: Mở URL đặc biệt để phát video đầu tiên (hoạt động trên một số thiết bị)
        const youtubeVndUrl = `vnd.youtube:///results?search_query=${encodeURIComponent(
            searchTerm
        )}&autoplay=1`;

        // Phương pháp 3: Sử dụng schema được biết đến để tự động phát video đầu tiên
        const youtubePlayUrl = `youtube://youtube.com/v?search=${encodeURIComponent(
            searchTerm
        )}`;

        // Phương pháp 4: Fallback về trình duyệt với truy vấn tùy chỉnh để khuyến khích phát tự động
        const youtubeBrowserUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
            searchTerm
        )}&autoplay=1`;

        try {
            // Kiểm tra và thử từng phương pháp theo thứ tự ưu tiên
            if (await Linking.canOpenURL(youtubeVideoDirectUrl)) {
                await Linking.openURL(youtubeVideoDirectUrl);
            } else if (await Linking.canOpenURL(youtubeVndUrl)) {
                await Linking.openURL(youtubeVndUrl);
            } else if (await Linking.canOpenURL(youtubePlayUrl)) {
                await Linking.openURL(youtubePlayUrl);
            } else {
                // Fallback cuối cùng đến trình duyệt
                await Linking.openURL(youtubeBrowserUrl);
            }
        } catch (error) {
            console.error("Could not open YouTube:", error);
            // Fallback an toàn
            Linking.openURL(youtubeBrowserUrl);
        }

        speak(`Đang mở video ${searchTerm} trên YouTube`);
        return true;
    };

    // Helper function to extract search query from text
    const extractSearchQuery = (text: string) => {
        const searchPattern = /(tìm kiếm|tìm|search|google)\s+(.+)/i;
        const match = text.match(searchPattern);
        return match ? match[2].trim() : null;
    };

    // Process commands related to map history
    const processMapHistoryCommand = (command: string) => {
        if (
            command.includes("lịch sử tìm kiếm") ||
            command.includes("lịch sử bản đồ")
        ) {
            if (mapHistory.length === 0) {
                const botResponse: Message = {
                    id: generateId(),
                    text: "Bạn chưa có lịch sử tìm kiếm bản đồ nào.",
                    isUser: false,
                    timestamp: new Date(),
                };
                setMessages((prevMessages) => [...prevMessages, botResponse]);
                speak("Bạn chưa có lịch sử tìm kiếm bản đồ nào.");
            } else {
                toggleMapHistory();
            }
            return true;
        } else if (command.includes("xóa lịch sử")) {
            clearMapHistory();
            return true;
        }
        return false;
    };

    // Call Gemini API using the new implementation
    const callGeminiAPI = async (prompt: string) => {
        const messageId = generateId();

        // Create "processing" message with isLoading status
        const loadingResponse: Message = {
            id: messageId,
            text: "Đang xử lý câu hỏi của bạn...",
            isUser: false,
            timestamp: new Date(),
            isLoading: true,
        };

        setMessages((prevMessages) => [...prevMessages, loadingResponse]);

        try {
            if (!chatSession) {
                throw new Error("Chat session not initialized");
            }

            // Use the new Gemini API client
            const result = await chatSession.sendMessage(prompt);
            const geminiResponse = result.response.text();

            // Update message with result from Gemini
            setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                    msg.id === messageId
                        ? {
                              ...msg,
                              text: geminiResponse,
                              isLoading: false,
                          }
                        : msg
                )
            );

            // Read response (if not too long)
            if (geminiResponse.length < 200) {
                speak(geminiResponse);
            } else {
                // If too long, only read first 2 sentences
                const firstSentences = geminiResponse
                    .split(". ")
                    .slice(0, 2)
                    .join(". ");
                speak(firstSentences + ".");
            }
        } catch (error) {
            console.error("Error calling Gemini API:", error);

            // Update message with error notification
            setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                    msg.id === messageId
                        ? {
                              ...msg,
                              text: "Xin lỗi, tôi đang gặp sự cố khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.",
                              isLoading: false,
                          }
                        : msg
                )
            );

            speak("Xin lỗi, tôi đang gặp sự cố khi xử lý yêu cầu của bạn");
        }
    };

    // Process user message
    const processUserMessage = async (userText: string) => {
        const lowerText = userText.toLowerCase();

        // Check if message is about map history
        if (processMapHistoryCommand(lowerText)) {
            return;
        }

        // NEW: Check if it's a Google search request
        if (handleGoogleSearch(userText)) {
            return;
        }

        // NEW: Check if it's a YouTube request
        if (await handleYouTubeRequest(userText)) {
            return;
        }

        if (await handleAlarmRequest(userText)) {
            return;
        }

        // Check if message has a directions request
        if (
            lowerText.includes("chỉ đường") ||
            lowerText.includes("đường đi") ||
            lowerText.includes("làm sao để đi")
        ) {
            handleDirectionsRequest(userText);
            return;
        }

        // Process time question message
        if (lowerText.includes("mấy giờ") || lowerText.includes("thời gian")) {
            const timeResponse = `Bây giờ là ${new Date().toLocaleTimeString()}, ngày ${new Date().toLocaleDateString(
                "vi-VN"
            )}`;
            speak(timeResponse);

            const botResponse: Message = {
                id: generateId(),
                text: timeResponse,
                isUser: false,
                timestamp: new Date(),
            };

            setMessages((prevMessages) => [...prevMessages, botResponse]);
            return;
        }

        // Call Gemini API for other messages
        callGeminiAPI(userText);
    };

    const handleTextChange = (value: string): void => {
        setText(value);
    };

    // Format display time
    const formatTime = (date: Date): string => {
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // Format timestamp for history items
    const formatHistoryTime = (timestamp: string): string => {
        const date = new Date(timestamp);
        return date.toLocaleString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // Component to display map in message
    const MessageMap = ({ msgId }: { msgId: string }) => {
        // Only display map if messageId matches and has location data
        if (mapData.messageId !== msgId || !mapData.startLocation) {
            return null;
        }

        return (
            <View style={styles.mapContainer}>
                <MapView
                    zoomControlEnabled
                    style={styles.map}
                    initialRegion={{
                        latitude: mapData.startLocation.latitude,
                        longitude: mapData.startLocation.longitude,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                    }}
                >
                    {mapData.startLocation && (
                        <Marker
                            coordinate={mapData.startLocation}
                            title={mapData.startName}
                            pinColor="green"
                        />
                    )}
                    {mapData.endLocation && (
                        <Marker
                            coordinate={mapData.endLocation}
                            title={mapData.endName}
                            pinColor="red"
                        />
                    )}
                    {mapData.route && (
                        <Polyline
                            coordinates={mapData.route}
                            strokeColor="#0066ff"
                            strokeWidth={4}
                        />
                    )}
                </MapView>

                {mapData.startLocation && mapData.endLocation && (
                    <TouchableOpacity
                        style={styles.openMapsButton}
                        onPress={() => {
                            openGoogleMaps(mapData.startName, mapData.endName);
                        }}
                    >
                        <Text style={styles.openMapsButtonText}>
                            Mở trong Google Maps
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    // Map History Panel Component
    const MapHistoryPanel = () => {
        if (!showHistory) return null;

        return (
            <View style={styles.historyPanel}>
                <View style={styles.historyHeader}>
                    <Text style={styles.historyTitle}>Lịch sử tìm kiếm</Text>
                    <TouchableOpacity
                        style={styles.historyCloseButton}
                        onPress={toggleMapHistory}
                    >
                        <Icon name="close" size={24} color="#424242" />
                    </TouchableOpacity>
                </View>

                {mapHistory.length === 0 ? (
                    <Text style={styles.noHistoryText}>
                        Chưa có lịch sử tìm kiếm
                    </Text>
                ) : (
                    <>
                        <ScrollView style={styles.historyList}>
                            {mapHistory.map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    style={styles.historyItem}
                                    onPress={() => handleHistoryItem(item)}
                                >
                                    <View style={styles.historyItemContent}>
                                        <Icon
                                            name="history"
                                            size={16}
                                            color="#4285F4"
                                            style={styles.historyIcon}
                                        />
                                        <View
                                            style={styles.historyTextContainer}
                                        >
                                            <Text
                                                style={styles.historyItemTitle}
                                            >
                                                {item.startLocation} →{" "}
                                                {item.endLocation}
                                            </Text>
                                            <Text
                                                style={styles.historyItemTime}
                                            >
                                                {formatHistoryTime(
                                                    item.timestamp
                                                )}
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <TouchableOpacity
                            style={styles.clearHistoryButton}
                            onPress={clearMapHistory}
                        >
                            <Icon name="delete" size={16} color="#D32F2F" />
                            <Text style={styles.clearHistoryText}>
                                Xóa lịch sử
                            </Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        );
    };

    return (
        <>
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    style={styles.container}
                    behavior={Platform.OS === "ios" ? "padding" : "height"} // Sử dụng "height" cho Android
                    keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}  // Điều chỉnh offset cho Android
                >
                    <View style={styles.chatContainer}>
                        {/* Map History Button */}
                        <TouchableOpacity
                            style={styles.historyButton}
                            onPress={toggleMapHistory}
                        >
                            <Icon name="history" size={20} color="#4285F4" />
                            <Text style={styles.historyButtonText}>
                                Lịch sử
                            </Text>
                        </TouchableOpacity>

                        <ScrollView
                            ref={scrollViewRef}
                            style={styles.messagesList}
                            contentContainerStyle={styles.messagesContent}
                        >
                            {messages.map((message) => (
                                <View
                                    key={message.id}
                                    style={[
                                        styles.messageContainer,
                                        message.isUser
                                            ? styles.userMessageContainer
                                            : styles.botMessageContainer,
                                    ]}
                                >
                                    <View style={styles.messageHeader}>
                                        <Text style={styles.messageSender}>
                                            {message.isUser
                                                ? userName
                                                : botName}
                                        </Text>
                                        <Text style={styles.messageTime}>
                                            {formatTime(message.timestamp)}
                                        </Text>
                                    </View>
                                    <View
                                        style={[
                                            styles.messageBody,
                                            message.isUser
                                                ? styles.userMessageBody
                                                : styles.botMessageBody,
                                        ]}
                                    >
                                        {message.isLoading ? (
                                            <ActivityIndicator
                                                color="#4285F4"
                                                size="small"
                                            />
                                        ) : (
                                            <Text style={styles.messageText}>
                                                {message.text}
                                            </Text>
                                        )}

                                        {/* Display map if message has map data */}
                                        {message.showMap && (
                                            <MessageMap msgId={message.id} />
                                        )}
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        {/* Show Map History Panel */}
                        <MapHistoryPanel />

                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                value={text}
                                onChangeText={handleTextChange}
                                placeholder={placeholder}
                                placeholderTextColor="#757575"
                                multiline
                                onSubmitEditing={handleSend}
                            />
                            <View style={styles.buttonsContainer}>
                                {text.length > 0 && (
                                    <TouchableOpacity
                                        style={styles.clearButton}
                                        onPress={handleClear}
                                    >
                                        <Icon
                                            name="close"
                                            size={20}
                                            color="#757575"
                                        />
                                    </TouchableOpacity>
                                )}
                                <Transtext setText={setText} text={text} />
                                <TouchableOpacity
                                    style={[
                                        styles.sendButton,
                                        {
                                            backgroundColor:
                                                text.trim() !== ""
                                                    ? "#4285F4"
                                                    : "#BDBDBD",
                                        },
                                    ]}
                                    onPress={handleSend}
                                    disabled={text.trim() === ""}
                                >
                                    <Icon name="send" size={20} color="white" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#F5F5F5",
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0, // Xử lý thanh trạng thái Android
    },
    container: {
        // backgroundColor: "#333",
        flex: 1,
    },
    chatContainer: {
        flex: 1,
        paddingTop: 10,
        position: "relative",
    },
    messagesList: {
        flex: 1,
    },
    messagesContent: {
        paddingHorizontal: 16,
        paddingBottom: 10,
    },
    messageContainer: {
        maxWidth: "85%",
        marginVertical: 8,
        borderRadius: 12,
    },
    userMessageContainer: {
        alignSelf: "flex-end",
    },
    botMessageContainer: {
        alignSelf: "flex-start",
    },
    messageHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 4,
        paddingHorizontal: 4,
    },
    messageSender: {
        fontSize: 12,
        fontWeight: "bold",
        color: "#424242",
    },
    messageTime: {
        fontSize: 10,
        color: "#757575",
    },
    messageBody: {
        padding: 12,
        borderRadius: 12,
    },
    userMessageBody: {
        backgroundColor: "#E3F2FD",
        borderTopRightRadius: 0,
    },
    botMessageBody: {
        backgroundColor: "white",
        borderTopLeftRadius: 0,
    },
    messageText: {
        fontSize: 15,
        color: "#212121",
        lineHeight: 20,
    },
    inputContainer: {
        flexDirection: "row",
        alignItems: "center",
        padding: 8,
        backgroundColor: "white",
        borderTopWidth: 1,
        // paddingBottom: 50,
        borderTopColor: "#E0E0E0",
    },
    input: {
        flex: 1,
        minHeight: 40,
        maxHeight: 120,
        borderWidth: 1,
        borderColor: "#E0E0E0",
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: "#F5F5F5",
        color: "#212121",
        fontSize: 16,
    },
    buttonsContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginLeft: 8,
    },
    clearButton: {
        padding: 8,
    },
    micButton: {
        padding: 8,
    },
    sendButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: "center",
        alignItems: "center",
    },
    mapContainer: {
        height: 200,
        marginTop: 10,
        borderRadius: 8,
        overflow: "hidden",
    },
    map: {
        ...StyleSheet.absoluteFillObject,
    },
    openMapsButton: {
        position: "absolute",
        bottom: 10,
        right: 10,
        backgroundColor: "white",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.22,
        shadowRadius: 2.22,
        elevation: 3,
    },
    openMapsButtonText: {
        color: "#4285F4",
        fontWeight: "500",
        fontSize: 12,
    },
    historyButton: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-end",
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginRight: 16,
        marginBottom: 8,
        backgroundColor: "white",
        borderRadius: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 1.5,
        elevation: 2,
    },
    historyButtonText: {
        color: "#4285F4",
        marginLeft: 4,
        fontSize: 12,
        fontWeight: "500",
    },
    historyPanel: {
        position: "absolute",
        top: 10,
        left: 10,
        right: 10,
        backgroundColor: "white",
        borderRadius: 12,
        padding: 16,
        maxHeight: "70%",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
        zIndex: 10,
    },
    historyHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    historyTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#212121",
    },
    historyCloseButton: {
        padding: 2,
    },
    historyList: {
        maxHeight: 300,
    },
    historyItem: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#EEEEEE",
    },
    historyItemContent: {
        flexDirection: "row",
        alignItems: "center",
    },
    historyIcon: {
        marginRight: 8,
    },
    historyTextContainer: {
        flex: 1,
    },
    historyItemTitle: {
        fontSize: 14,
        color: "#212121",
    },
    historyItemTime: {
        fontSize: 12,
        color: "#757575",
        marginTop: 2,
    },
    noHistoryText: {
        textAlign: "center",
        color: "#757575",
        padding: 20,
    },
    clearHistoryButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 12,
        paddingVertical: 8,
        backgroundColor: "#FFEBEE",
        borderRadius: 8,
    },
    clearHistoryText: {
        color: "#D32F2F",
        marginLeft: 8,
        fontSize: 14,
        fontWeight: "500",
    },
});

export default GoogleAssistantChat;
