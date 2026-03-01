from numpy import random

cities = {}

class City:
    def __init__(self, latitude:tuple[str], longitude:tuple[str]):
        self.latitude = latitude
        self.longitude = longitude
    
    def get_random_point(self):
        return (round(random.uniform(*self.latitude), 5),
                round(random.uniform(*self.longitude), 5))

