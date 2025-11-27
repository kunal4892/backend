import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface TypingIndicatorProps {
  personaName: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ personaName }) => {
  const [dots, setDots] = React.useState('');

  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {personaName} is typing{dots}
      </Text>
      <View style={styles.dots}>
        <View style={[styles.dot, { opacity: dots.length >= 1 ? 1 : 0.3 }]} />
        <View style={[styles.dot, { opacity: dots.length >= 2 ? 1 : 0.3 }]} />
        <View style={[styles.dot, { opacity: dots.length >= 3 ? 1 : 0.3 }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    marginVertical: 4,
    alignSelf: 'flex-start',
    maxWidth: '80%',
  },
  text: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#666',
    marginHorizontal: 2,
  },
});

