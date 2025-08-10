import { ref, onMounted, onUnmounted } from 'vue'

// 鼠标跟随效果
export function useMouseFollow(elementRef) {
  const mouseX = ref(0)
  const mouseY = ref(0)

  const handleMouseMove = (e) => {
    if (!elementRef.value) return
    const rect = elementRef.value.getBoundingClientRect()
    mouseX.value = e.clientX - rect.left
    mouseY.value = e.clientY - rect.top
    elementRef.value.style.setProperty('--mouse-x', `${mouseX.value}px`)
    elementRef.value.style.setProperty('--mouse-y', `${mouseY.value}px`)
  }

  onMounted(() => {
    if (elementRef.value) {
      elementRef.value.addEventListener('mousemove', handleMouseMove)
    }
  })

  onUnmounted(() => {
    if (elementRef.value) {
      elementRef.value.removeEventListener('mousemove', handleMouseMove)
    }
  })

  return { mouseX, mouseY }
}

// 滚动视差效果
export function useParallax() {
  const scrollY = ref(0)

  const handleScroll = () => {
    scrollY.value = window.scrollY
    document.documentElement.style.setProperty('--scroll-y', scrollY.value)
  }

  onMounted(() => {
    window.addEventListener('scroll', handleScroll)
    handleScroll()
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', handleScroll)
  })

  return { scrollY }
}

// 涟漪效果
export function createRipple(event, container) {
  const ripple = document.createElement('span')
  const rect = container.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  const x = event.clientX - rect.left - size / 2
  const y = event.clientY - rect.top - size / 2

  ripple.style.width = ripple.style.height = size + 'px'
  ripple.style.left = x + 'px'
  ripple.style.top = y + 'px'
  ripple.classList.add('ripple-effect')
  
  container.appendChild(ripple)
  
  setTimeout(() => {
    ripple.remove()
  }, 600)
}

// 五彩纸屑效果
export function createConfetti(container = document.body) {
  const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#00f260', '#0575e6']
  const confettiCount = 50
  
  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div')
    confetti.className = 'confetti-piece'
    confetti.style.cssText = `
      position: fixed;
      width: 10px;
      height: 10px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 9999;
    `
    
    container.appendChild(confetti)
    
    // 动画
    const angle = Math.random() * Math.PI * 2
    const velocity = 10 + Math.random() * 10
    const gravity = 0.3
    let x = 0
    let y = 0
    let vx = Math.cos(angle) * velocity
    let vy = Math.sin(angle) * velocity - 10
    let opacity = 1
    
    const animate = () => {
      x += vx
      y += vy
      vy += gravity
      opacity -= 0.02
      
      confetti.style.transform = `translate(${x}px, ${y}px) rotate(${Math.random() * 360}deg)`
      confetti.style.opacity = opacity
      
      if (opacity > 0) {
        requestAnimationFrame(animate)
      } else {
        confetti.remove()
      }
    }
    
    requestAnimationFrame(animate)
  }
}

// 打字机效果
export function useTypewriter(text, speed = 100) {
  const displayText = ref('')
  const isTyping = ref(false)
  
  const startTyping = () => {
    if (isTyping.value) return
    
    isTyping.value = true
    displayText.value = ''
    let index = 0
    
    const type = () => {
      if (index < text.length) {
        displayText.value += text[index]
        index++
        setTimeout(type, speed)
      } else {
        isTyping.value = false
      }
    }
    
    type()
  }
  
  return { displayText, isTyping, startTyping }
}

// 音效播放
export function playSound(type = 'success') {
  const sounds = {
    success: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE',
    error: 'data:audio/wav;base64,UklGRqQEAABXQVZFZm10IBAAAAABAAEAiBUAAIgVAAABAAgAZGF0YQAEAACBiYmFfYGJiYV9gYmJhX2BiYmFfYGJiYV9gYmJhX2BiYmFfYGJiYV9gYmJhX2BiYmFfYGJiYV9gYmJhX2BiYmFfYGJiYV9gYmJhX2BiYmFfYGJiYV9gYmJhX2BiYmFfYGJiYV9gYmJhX2BiYmFfQ==',
    click: 'data:audio/wav;base64,UklGRkQCAABXQVZFZm10IBAAAAABAAEAiBUAAIgVAAABAAgAZGF0YSACAADm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm'
  }
  
  const audio = new Audio(sounds[type] || sounds.click)
  audio.volume = 0.3
  audio.play().catch(() => {})
}

// 磁性按钮效果
export function useMagneticButton(buttonRef) {
  const handleMouseMove = (e) => {
    if (!buttonRef.value) return
    
    const rect = buttonRef.value.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    
    const distance = Math.sqrt(x * x + y * y)
    const maxDistance = 100
    
    if (distance < maxDistance) {
      const strength = (maxDistance - distance) / maxDistance
      buttonRef.value.style.transform = `translate(${x * strength * 0.3}px, ${y * strength * 0.3}px)`
    }
  }
  
  const handleMouseLeave = () => {
    if (buttonRef.value) {
      buttonRef.value.style.transform = ''
    }
  }
  
  onMounted(() => {
    if (buttonRef.value) {
      const container = buttonRef.value.parentElement
      container.addEventListener('mousemove', handleMouseMove)
      container.addEventListener('mouseleave', handleMouseLeave)
    }
  })
  
  onUnmounted(() => {
    if (buttonRef.value) {
      const container = buttonRef.value.parentElement
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
    }
  })
}

// 震动效果（用于错误提示）
export function shake(element) {
  element.classList.add('shake')
  setTimeout(() => {
    element.classList.remove('shake')
  }, 500)
}